const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RealtimeNamespace extends Model {}

  RealtimeNamespace.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      gateway_config_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'api_gateway_configs', key: 'id' },
        onDelete: 'CASCADE',
      },
      namespace_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      auth_logic: {
        type: DataTypes.STRING(3),
        defaultValue: 'or',
        validate: { isIn: [['or', 'and']] },
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: 'RealtimeNamespace',
      tableName: 'realtime_namespaces',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    },
  );

  RealtimeNamespace.associate = (models) => {
    RealtimeNamespace.belongsTo(models.ApiGatewayConfig, { foreignKey: 'gateway_config_id' });
    RealtimeNamespace.hasMany(models.RealtimeEventHandler, {
      foreignKey: 'realtime_namespace_id',
      as: 'eventHandlers',
    });
    RealtimeNamespace.belongsToMany(models.ApiGatewayAuthMethod, {
      through: models.RealtimeNamespaceAuthMethod,
      foreignKey: 'realtime_namespace_id',
      otherKey: 'auth_method_id',
      as: 'authMethods',
    });
  };

  return RealtimeNamespace;
};
