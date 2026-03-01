const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ApiKey extends Model {}

  ApiKey.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      key_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      last_used: {
        type: DataTypes.DATE,
      },
      usage_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'ApiKey',
      tableName: 'api_keys',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  ApiKey.associate = (models) => {
    ApiKey.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return ApiKey;
};
