# 数据集审计（只读）

```json
{
  "source": "情绪检测.zip",
  "source_sha256": "2ee36d9dba8b84aac4219a5b80841ef458d79396ee30bcc8218c93fc0ef70140",
  "zip_bytes": 340645743,
  "uncompressed_bytes": 341532410,
  "images": 35887,
  "corrupt": 0,
  "unknown_labels": [],
  "dimensions": {
    "48x48": 35887
  },
  "low_contrast_stddev_lt_5": 12,
  "cross_split_exact_groups": 557,
  "near_cross_split_candidate_groups": 716,
  "elapsed_seconds": 14.261,
  "extensions": {
    "(directory/no suffix)": 36,
    ".iml": 1,
    ".xml": 6,
    ".ds_store": 2,
    ".png": 46,
    ".jpg": 35889,
    ".py": 13,
    ".hdf5": 14,
    ".md": 1,
    ".txt": 1,
    ".jpeg": 1,
    ".mp4": 2,
    ".log": 1,
    ".pyc": 16
  }
}
```

## 类别分布
|原始拆分|原始类别|数量|
|---|---|---:|
|PrivateTest|anger|491|
|PrivateTest|disgust|55|
|PrivateTest|fear|528|
|PrivateTest|happy|879|
|PrivateTest|neutral|626|
|PrivateTest|sad|594|
|PrivateTest|surprised|416|
|PublicTest|anger|467|
|PublicTest|disgust|56|
|PublicTest|fear|496|
|PublicTest|happy|895|
|PublicTest|neutral|607|
|PublicTest|sad|653|
|PublicTest|surprised|415|
|Training|anger|3995|
|Training|disgust|436|
|Training|fear|4097|
|Training|happy|7215|
|Training|neutral|4965|
|Training|sad|4830|
|Training|surprised|3171|

## 拆分与标签
保留 Training / PublicTest（验证）/ PrivateTest（封存测试）；不重新随机拆分。原始标签 anger→angry、happy→happiness、sad→sadness、surprised→surprise，其他同名。模型 FER+ 另含 contempt，评测计入错误，不合并或剔除该预测。测试集仅最终经批准的候选选择之后使用。

## 数据质量与泄漏
详见 dataset_manifest.csv 与 duplicates.csv。SHA-256 同时记录文件与解码灰度像素；近重复仅检查 64-bit dHash 距离≤1，属于待人工核验候选，不能排除更多裁剪/压缩/身份泄漏。没有身份 ID、视频源或可证实身份互斥分组，无法保证跨身份独立。近重复检查未更改原数据或拆分。
FER+ 预训练源包含 FER2013，即使使用既定测试集也不能宣称独立外部泛化效果。没有检查人脸是否真实/标签是否正确（需人工），低对比度只是质量提示。

## 许可与隐私
压缩包未附数据集或旧权重可核验授权文件；README 指向 Kaggle 不构成用户已获得再分发授权。数据/旧权重不得打包到网站或公开仓库。比赛使用许可仍需由数据提供方确认。应用模型改用独立记录许可的 ONNX Model Zoo 基线。
