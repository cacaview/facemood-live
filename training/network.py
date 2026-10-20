from torch import nn


class TinyExpressionNet(nn.Module):
    """Candidate only, never substitutes untrained predictions for frozen baseline."""

    def __init__(self):
        super().__init__()
        parts = []
        inc = 1
        for channels in (16, 32, 64, 96):
            parts.extend(
                [
                    nn.Conv2d(inc, channels, 3, padding=1),
                    nn.BatchNorm2d(channels),
                    nn.ReLU(),
                    nn.MaxPool2d(2),
                ]
            )
            inc = channels
        self.features = nn.Sequential(*parts)
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(96, 8)
        )

    def forward(self, x):
        return self.head(self.features(x))
