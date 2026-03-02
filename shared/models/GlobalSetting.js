const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class GlobalSetting extends Model {}

  GlobalSetting.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      setting_key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      setting_value: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: 'GlobalSetting',
      tableName: 'global_settings',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  // No associations — global settings are standalone configuration rows.

  return GlobalSetting;
};
