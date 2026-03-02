const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApiGatewayConfig extends Model {}

  ApiGatewayConfig.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      custom_domain: {
        type: DataTypes.STRING(255),
        unique: true,
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
      modelName: 'ApiGatewayConfig',
      tableName: 'api_gateway_configs',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  ApiGatewayConfig.associate = (models) => {
    ApiGatewayConfig.belongsTo(models.Project, { foreignKey: 'project_id' });
    ApiGatewayConfig.hasMany(models.ApiGatewayRoute, { foreignKey: 'gateway_config_id' });
    ApiGatewayConfig.hasMany(models.ApiGatewayAuthMethod, { foreignKey: 'gateway_config_id' });
  };

  return ApiGatewayConfig;
};
