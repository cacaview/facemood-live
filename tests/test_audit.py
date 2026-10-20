import io, zipfile
from PIL import Image


def test_audit_preserves_splits_and_reports_leakage(tmp_path):
    from scripts.audit_dataset import audit

    b = io.BytesIO()
    Image.new("L", (48, 48), 100).save(b, format="PNG")
    p = tmp_path / "sample.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("x/fer2013/Training/happy/1.png", b.getvalue())
        z.writestr("x/fer2013/PublicTest/happy/2.png", b.getvalue())
        z.writestr("x/fer2013/PrivateTest/alien/bad.jpg", b"bad")
    result = audit(p, tmp_path / "reports")
    assert result["images"] == 3
    assert result["corrupt"] == 1
    assert result["cross_split_exact_groups"] == 1
    assert "alien" in result["unknown_labels"]
    assert (tmp_path / "reports/dataset_manifest.csv").exists()
