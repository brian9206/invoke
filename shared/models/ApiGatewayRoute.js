const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApiGatewayRoute extends Model {}

  ApiGatewayRoute.init(
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
      route_path: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      // nullable — ON DELETE SET NULL
      function_id: {
        type: DataTypes.UUID,
        references: { model: 'functions', key: 'id' },
        onDelete: 'SET NULL',
      },
      allowed_methods: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        defaultValue: ['GET', 'POST'],
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // auth_logic added in migration 004
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
      modelName: 'ApiGatewayRoute',
      tableName: 'api_gateway_routes',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [{ unique: true, fields: ['gateway_config_id', 'route_path'] }],
    }
  );

  ApiGatewayRoute.associate = (models) => {
    ApiGatewayRoute.belongsTo(models.ApiGatewayConfig, { foreignKey: 'gateway_config_id' });
    ApiGatewayRoute.belongsTo(models.Function, { foreignKey: 'function_id' });
    ApiGatewayRoute.hasOne(models.ApiGatewayRouteSettings, {
      foreignKey: 'route_id',
      as: 'settings',
    });
    ApiGatewayRoute.belongsToMany(models.ApiGatewayAuthMethod, {
      through: models.ApiGatewayRouteAuthMethod,
      foreignKey: 'route_id',
      otherKey: 'auth_method_id',
      as: 'authMethods',
    });
  };

  return ApiGatewayRoute;
};
