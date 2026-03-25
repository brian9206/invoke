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
      function_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE',
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
  };

  return FunctionLog;
};
