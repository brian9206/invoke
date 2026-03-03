class Console {
  constructor() {
    // Copy every property from the global console
    Object.getOwnPropertyNames(console).forEach(name => {
      const prop = console[name];
      if (typeof prop === 'function') {
        this[name] = (...args) => prop.apply(console, args);
      } else {
        this[name] = prop;
      }
    });
  }
}

module.exports = { Console };