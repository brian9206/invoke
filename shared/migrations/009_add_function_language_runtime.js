'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    const { DataTypes } = require('sequelize')

    await queryInterface.addColumn('functions', 'language', {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'javascript'
    })

    await queryInterface.addColumn('functions', 'runtime', {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'bun'
    })
  },

  async down({ context: { queryInterface } }) {
    await queryInterface.removeColumn('functions', 'runtime')
    await queryInterface.removeColumn('functions', 'language')
  }
}
