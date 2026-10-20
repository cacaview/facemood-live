"""Read-only ZIP audit. Original bytes never extracted or modified."""

import argparse, csv, hashlib, io, json, time, zipfile
from collections import Counter, defaultdict
from pathlib import Path
from PIL import Image, ImageStat

LABELS = {
    "anger",
    "disgust",
    "fear",
    "happy",
    "sad",
    "surprise",
    "surprised",
    "neutral",
}
SPLITS = {"Training", "PublicTest", "PrivateTest"}


def write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def audit(source, output):
    started = time.perf_counter()
    source = Path(source)
    out = Path(output)
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    exact = defaultdict(list)
    perceptual = defaultdict(list)
    distribution = Counter()
    extensions = Counter()
    unknown = set()
    total_bytes = 0
    with zipfile.ZipFile(source) as z:
        for info in z.infolist():
            total_bytes += info.file_size
            extensions[
                Path(info.filename).suffix.lower() or "(directory/no suffix)"
            ] += 1
            parts = info.filename.split("/")
            if "fer2013" not in parts or Path(info.filename).suffix.lower() not in {
                ".jpg",
                ".jpeg",
                ".png",
            }:
                continue
            ix = parts.index("fer2013")
            split, label = parts[ix + 1 : ix + 3]
            if label not in LABELS:
                unknown.add(label)
            b = z.read(info)
            row = dict(
                path=info.filename,
                split=split,
                label=label,
                bytes=len(b),
                sha256=hashlib.sha256(b).hexdigest(),
                pixel_sha256="",
                width="",
                height="",
                mode="",
                stddev="",
                dhash="",
                error="",
            )
            try:
                with Image.open(io.BytesIO(b)) as im:
                    im.load()
                    g = im.convert("L")
                    row.update(
                        width=im.width,
                        height=im.height,
                        mode=im.mode,
                        stddev=round(ImageStat.Stat(g).stddev[0], 4),
                        pixel_sha256=hashlib.sha256(
                            str(g.size).encode() + g.tobytes()
                        ).hexdigest(),
                    )
                    small = list(g.resize((9, 8)).getdata())
                    h = 0
                    for y in range(8):
                        for x in range(8):
                            h = (h << 1) | int(small[y * 9 + x] > small[y * 9 + x + 1])
                    row["dhash"] = f"{h:016x}"
                    perceptual[h].append(len(rows))
                    exact[row["pixel_sha256"]].append(len(rows))
            except Exception as e:
                row["error"] = str(e)
            distribution[(split, label)] += 1
            rows.append(row)
    duplicates = []
    cross_exact = 0
    for key, indices in exact.items():
        if len(indices) > 1:
            cross = len({rows[i]["split"] for i in indices}) > 1
            cross_exact += int(cross)
            duplicates.append(
                dict(
                    kind="exact_pixels",
                    hash=key,
                    other_hash="",
                    count=len(indices),
                    cross_split=cross,
                    paths=json.dumps(
                        [rows[i]["path"] for i in indices], ensure_ascii=False
                    ),
                )
            )
    # Radius 1 dHash search is bounded O(N*64); candidate flags, not proven duplicates/identity.
    for h, indices in perceptual.items():
        for other in [h] + [h ^ (1 << bit) for bit in range(64)]:
            if other < h or other not in perceptual:
                continue
            combined = indices if other == h else indices + perceptual[other]
            if len(combined) < 2 or len({rows[i]["split"] for i in combined}) < 2:
                continue
            duplicates.append(
                dict(
                    kind="dhash_distance_0_or_1",
                    hash=f"{h:016x}",
                    other_hash=f"{other:016x}",
                    count=len(combined),
                    cross_split=True,
                    paths=json.dumps(
                        [rows[i]["path"] for i in combined], ensure_ascii=False
                    ),
                )
            )
    write_csv(
        out / "dataset_manifest.csv",
        rows,
        list(rows[0]) if rows else ["path", "split", "label"],
    )
    write_csv(
        out / "class_distribution.csv",
        [dict(split=s, label=l, count=n) for (s, l), n in sorted(distribution.items())],
        ["split", "label", "count"],
    )
    write_csv(
        out / "duplicates.csv",
        duplicates,
        ["kind", "hash", "other_hash", "count", "cross_split", "paths"],
    )
    result = dict(
        source=str(source),
        source_sha256=hashlib.file_digest(source.open("rb"), "sha256").hexdigest(),
        zip_bytes=source.stat().st_size,
        uncompressed_bytes=total_bytes,
        images=len(rows),
        corrupt=sum(bool(r["error"]) for r in rows),
        unknown_labels=sorted(unknown),
        dimensions=dict(Counter(f"{r['width']}x{r['height']}" for r in rows)),
        low_contrast_stddev_lt_5=sum(
            isinstance(r["stddev"], float) and r["stddev"] < 5 for r in rows
        ),
        cross_split_exact_groups=cross_exact,
        near_cross_split_candidate_groups=sum(
            r["kind"].startswith("dhash") for r in duplicates
        ),
        elapsed_seconds=round(time.perf_counter() - started, 3),
        extensions=dict(extensions),
    )
    (out / "dataset_audit.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False)
    )
    table = "\n".join(f"|{s}|{l}|{n}|" for (s, l), n in sorted(distribution.items()))
    (out / "dataset_audit.md").write_text(
        f"""# 数据集审计（只读）

```json
{json.dumps(result, indent=2, ensure_ascii=False)}
```

## 类别分布
|原始拆分|原始类别|数量|
|---|---|---:|
{table}

## 拆分与标签
保留 Training / PublicTest（验证）/ PrivateTest（封存测试）；不重新随机拆分。原始标签 anger→angry、happy→happiness、sad→sadness、surprised→surprise，其他同名。模型 FER+ 另含 contempt，评测计入错误，不合并或剔除该预测。测试集仅最终经批准的候选选择之后使用。

## 数据质量与泄漏
详见 dataset_manifest.csv 与 duplicates.csv。SHA-256 同时记录文件与解码灰度像素；近重复仅检查 64-bit dHash 距离≤1，属于待人工核验候选，不能排除更多裁剪/压缩/身份泄漏。没有身份 ID、视频源或可证实身份互斥分组，无法保证跨身份独立。近重复检查未更改原数据或拆分。
FER+ 预训练源包含 FER2013，即使使用既定测试集也不能宣称独立外部泛化效果。没有检查人脸是否真实/标签是否正确（需人工），低对比度只是质量提示。

## 许可与隐私
压缩包未附数据集或旧权重可核验授权文件；README 指向 Kaggle 不构成用户已获得再分发授权。数据/旧权重不得打包到网站或公开仓库。比赛使用许可仍需由数据提供方确认。应用模型改用独立记录许可的 ONNX Model Zoo 基线。
""",
        encoding="utf-8",
    )
    return result


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--zip", default="情绪检测.zip")
    p.add_argument("--out", default="reports")
    a = p.parse_args()
    print(json.dumps(audit(a.zip, a.out), ensure_ascii=False, indent=2))
