const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RealtimeNamespaceAuthMethod extends Model {}

  RealtimeNamespaceAuthMethod.init(
    {
      realtime_namespace_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        references: { model: 'realtime_namespaces', key: 'id' },
        onDelete: 'CASCADE',
      },
      auth_method_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        references: { model: 'api_gateway_auth_methods', key: 'id' },
        onDelete: 'CASCADE',
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'RealtimeNamespaceAuthMethod',
      tableName: 'realtime_namespace_auth_methods',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    },
  );

  return RealtimeNamespaceAuthMethod;
};
