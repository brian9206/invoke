const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Project extends Model {}

  Project.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      kv_storage_limit_bytes: {
        type: DataTypes.BIGINT,
        defaultValue: 1073741824,
      },
      // slug added in migration 003
      slug: {
        type: DataTypes.STRING(100),
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
      modelName: 'Project',
      tableName: 'projects',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  Project.associate = (models) => {
    Project.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Project.hasMany(models.Function, { foreignKey: 'project_id' });
    Project.hasMany(models.ProjectMembership, { foreignKey: 'project_id' });
    Project.hasOne(models.ApiGatewayConfig, { foreignKey: 'project_id' });
    Project.hasMany(models.ProjectNetworkPolicy, { foreignKey: 'project_id' });
  };

  return Project;
};
