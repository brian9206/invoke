const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApiGatewayRouteSettings extends Model {}

  ApiGatewayRouteSettings.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      route_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'api_gateway_routes', key: 'id' },
        onDelete: 'CASCADE',
      },
      cors_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      cors_allowed_origins: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      cors_allowed_headers: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      cors_expose_headers: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        defaultValue: [],
      },
      cors_max_age: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 86400,
      },
      cors_allow_credentials: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      modelName: 'ApiGatewayRouteSettings',
      tableName: 'api_gateway_route_settings',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  ApiGatewayRouteSettings.associate = (models) => {
    ApiGatewayRouteSettings.belongsTo(models.ApiGatewayRoute, { foreignKey: 'route_id' });
  };

  return ApiGatewayRouteSettings;
};
