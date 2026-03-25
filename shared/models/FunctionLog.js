const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FunctionLog extends Model {}

  FunctionLog.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      // Nullable: execution logs carry a function_id; gateway logs may not.
      function_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE',
      },
      // Mandatory: every log is scoped to a project.
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      // 'request' = request/response log; 'app' = application log
      type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'request',
      },
      // 'execution' = emitted by invoke-execution; 'gateway' = emitted by invoke-gateway
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'execution',
      },
      executed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      // payload_search is a TSVECTOR populated by the DB trigger.
      // It is intentionally excluded from the model — do not write to it.
    },
    {
      sequelize,
      modelName: 'FunctionLog',
      tableName: 'function_logs',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    },
  );

  FunctionLog.associate = (models) => {
    FunctionLog.belongsTo(models.Function, { foreignKey: 'function_id' });
    FunctionLog.belongsTo(models.Project, { foreignKey: 'project_id' });
  };

  return FunctionLog;
};
