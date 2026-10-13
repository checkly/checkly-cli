class Store {
  accessor dep = require('./dep')
  accessor [require('./key')] = 0
}

export default Store
