from scripts.evaluate import classification_metrics


def test_contempt_is_error_not_discarded():
    r = classification_metrics([0, 0, 1, 1], [0, 7, 1, 1])
    assert r["accuracy"] == 0.75
    assert r["balanced_accuracy"] == 0.75
    assert r["support"][7] == 0
    assert r["confusion_matrix"][0][7] == 1
