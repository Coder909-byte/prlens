function add(a, b) {
  return helper(a) + b;
}

function helper(x) {
  return x * 2;
}

class Widget {
  render() {
    return add(1, 2);
  }
}

const double = (x) => helper(x) * 2;

exports.triple = function (x) {
  return helper(x) * 3;
};
