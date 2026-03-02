const { Model, DataTypes } = require('sequelize');

/**
 * Junction table for the many-to-many between routes and auth methods.
 * Composite primary key: (route_id, auth_method_id)
 * sort_order column added in migration 005.
 */
module.exports = (sequelize) => {
  class ApiGatewayRouteAuthMethod extends Model {}

  ApiGatewayRouteAuthMethod.init(
    {
      route_id: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        references: { model: 'api_gateway_routes', key: 'id' },
        onDelete: 'CASCADE',
      },
      auth_method_id: {
        type: DataTypes.UUID,
        allowNull: false,
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
      modelName: 'ApiGatewayRouteAuthMethod',
      tableName: 'api_gateway_route_auth_methods',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  ApiGatewayRouteAuthMethod.associate = (models) => {
    ApiGatewayRouteAuthMethod.belongsTo(models.ApiGatewayRoute, { foreignKey: 'route_id' });
    ApiGatewayRouteAuthMethod.belongsTo(models.ApiGatewayAuthMethod, {
      foreignKey: 'auth_method_id',
    });
  };

  return ApiGatewayRouteAuthMethod;
};
