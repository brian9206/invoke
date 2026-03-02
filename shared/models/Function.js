const { Model, DataTypes } = require('sequelize');

/**
 * NOTE: The class is named FunctionModel to avoid shadowing the JS built-in
 * Function object, but the Sequelize modelName is 'Function' and consumers
 * access it as models.Function.
 */
module.exports = (sequelize) => {
  class FunctionModel extends Model {}

  FunctionModel.init(
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
      project_id: {
        type: DataTypes.UUID,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      deployed_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
      },
      requires_api_key: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      api_key: {
        type: DataTypes.STRING(255),
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
      last_executed: {
        type: DataTypes.DATE,
      },
      execution_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      // FK back to function_versions — set up after both tables exist
      active_version_id: {
        type: DataTypes.UUID,
        references: { model: 'function_versions', key: 'id' },
      },
      retention_type: {
        type: DataTypes.STRING(10),
        validate: { isIn: [['time', 'count', 'none']] },
      },
      retention_value: {
        type: DataTypes.INTEGER,
      },
      retention_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      schedule_enabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      schedule_cron: {
        type: DataTypes.STRING(100),
      },
      next_execution: {
        type: DataTypes.DATE,
      },
      last_scheduled_execution: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: 'Function',
      tableName: 'functions',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  FunctionModel.associate = (models) => {
    FunctionModel.belongsTo(models.Project, { foreignKey: 'project_id' });
    FunctionModel.belongsTo(models.User, { foreignKey: 'deployed_by', as: 'deployedBy' });
    FunctionModel.hasMany(models.FunctionVersion, { foreignKey: 'function_id' });
    // Circular FK — FunctionVersion must already be initialised
    FunctionModel.belongsTo(models.FunctionVersion, {
      foreignKey: 'active_version_id',
      as: 'activeVersion',
      constraints: false, // constraint already exists at DB level
    });
    FunctionModel.hasMany(models.ExecutionLog, { foreignKey: 'function_id' });
    FunctionModel.hasMany(models.FunctionEnvironmentVariable, { foreignKey: 'function_id' });
  };

  return FunctionModel;
};
