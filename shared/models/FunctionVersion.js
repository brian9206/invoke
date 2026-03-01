const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FunctionVersion extends Model {}

  FunctionVersion.init(
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
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      file_size: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      package_path: {
        type: DataTypes.STRING(500),
      },
      package_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      created_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' },
      },
    },
    {
      sequelize,
      modelName: 'FunctionVersion',
      tableName: 'function_versions',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [{ unique: true, fields: ['function_id', 'version'] }],
    }
  );

  FunctionVersion.associate = (models) => {
    FunctionVersion.belongsTo(models.Function, { foreignKey: 'function_id' });
    FunctionVersion.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return FunctionVersion;
};
