const createInfiniteProxy = () => {
  return new Proxy(() => {}, {
    get(target, prop) {
      if (prop === "__esModule") return true;
      return createInfiniteProxy();
    },
  });
};

module.exports = createInfiniteProxy();
