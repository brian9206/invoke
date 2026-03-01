const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ExecutionLog extends Model {}

  ExecutionLog.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      function_id: {
        type: DataTypes.UUID,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE',
      },
      status_code: {
        type: DataTypes.INTEGER,
      },
      execution_time_ms: {
        type: DataTypes.INTEGER,
      },
      request_size: {
        type: DataTypes.BIGINT,
      },
      response_size: {
        type: DataTypes.BIGINT,
      },
      request_headers: {
        type: DataTypes.JSONB,
      },
      response_headers: {
        type: DataTypes.JSONB,
      },
      request_body: {
        type: DataTypes.TEXT,
      },
      response_body: {
        type: DataTypes.TEXT,
      },
      request_method: {
        type: DataTypes.STRING(10),
      },
      request_url: {
        type: DataTypes.TEXT,
      },
      console_logs: {
        type: DataTypes.JSONB,
      },
      error_message: {
        type: DataTypes.TEXT,
      },
      // PostgreSQL INET — Sequelize has no native type; stored as string
      client_ip: {
        type: DataTypes.STRING(45),
      },
      user_agent: {
        type: DataTypes.TEXT,
      },
      api_key_used: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      executed_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: 'ExecutionLog',
      tableName: 'execution_logs',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  ExecutionLog.associate = (models) => {
    ExecutionLog.belongsTo(models.Function, { foreignKey: 'function_id' });
  };

  return ExecutionLog;
};
