const { Model, DataTypes } = require('sequelize')

module.exports = sequelize => {
  class NetworkPolicy extends Model {}

  NetworkPolicy.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      action: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['allow', 'deny']] }
      },
      target_type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['ip', 'cidr', 'domain']] }
      },
      target_value: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      description: {
        type: DataTypes.STRING(255)
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      created_at: {
        type: DataTypes.DATE
      }
    },
    {
      sequelize,
      modelName: 'NetworkPolicy',
      tableName: 'global_network_policies',
      timestamps: false,
      underscored: true,
      freezeTableName: true
    }
  )

  return NetworkPolicy
}
