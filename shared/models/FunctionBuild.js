const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FunctionBuild extends Model {}

  FunctionBuild.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      function_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE',
      },
      version_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'function_versions', key: 'id' },
        onDelete: 'CASCADE',
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'queued',
        // queued | running | success | failed | cancelled
      },
      after_build_action: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'none',
        // none | switch
      },
      artifact_path: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      artifact_hash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      build_log: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'FunctionBuild',
      tableName: 'function_builds',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  FunctionBuild.associate = (models) => {
    FunctionBuild.belongsTo(models.Function, { foreignKey: 'function_id' });
    FunctionBuild.belongsTo(models.FunctionVersion, { foreignKey: 'version_id', as: 'version' });
    FunctionBuild.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return FunctionBuild;
};
