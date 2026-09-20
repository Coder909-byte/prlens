def helper(x):
    return x * 2


class Widget:
    def render(self):
        return add(1, 2)


def add(a, b):
    return helper(a) + b
