const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class RealtimeEventHandler extends Model {}

  RealtimeEventHandler.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      realtime_namespace_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'realtime_namespaces', key: 'id' },
        onDelete: 'CASCADE',
      },
      event_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      function_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'functions', key: 'id' },
        onDelete: 'SET NULL',
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
      modelName: 'RealtimeEventHandler',
      tableName: 'realtime_event_handlers',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    },
  );

  RealtimeEventHandler.associate = (models) => {
    RealtimeEventHandler.belongsTo(models.RealtimeNamespace, {
      foreignKey: 'realtime_namespace_id',
    });
    RealtimeEventHandler.belongsTo(models.Function, { foreignKey: 'function_id' });
  };

  return RealtimeEventHandler;
};
