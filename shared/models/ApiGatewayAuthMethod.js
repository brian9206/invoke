const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApiGatewayAuthMethod extends Model {}

  ApiGatewayAuthMethod.init(
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
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      // 'middleware' type added in migration 004
      type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['basic_auth', 'bearer_jwt', 'api_key', 'middleware']] },
      },
      config: {
        type: DataTypes.JSONB,
        defaultValue: {},
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
      modelName: 'ApiGatewayAuthMethod',
      tableName: 'api_gateway_auth_methods',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [{ unique: true, fields: ['gateway_config_id', 'name'] }],
    }
  );

  ApiGatewayAuthMethod.associate = (models) => {
    ApiGatewayAuthMethod.belongsTo(models.ApiGatewayConfig, { foreignKey: 'gateway_config_id' });
    ApiGatewayAuthMethod.belongsToMany(models.ApiGatewayRoute, {
      through: models.ApiGatewayRouteAuthMethod,
      foreignKey: 'auth_method_id',
      otherKey: 'route_id',
      as: 'routes',
    });
  };

  return ApiGatewayAuthMethod;
};
