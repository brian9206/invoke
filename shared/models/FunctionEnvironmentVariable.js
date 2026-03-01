const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FunctionEnvironmentVariable extends Model {}

  FunctionEnvironmentVariable.init(
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
      variable_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      variable_value: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
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
      modelName: 'FunctionEnvironmentVariable',
      tableName: 'function_environment_variables',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [{ unique: true, fields: ['function_id', 'variable_name'] }],
    }
  );

  FunctionEnvironmentVariable.associate = (models) => {
    FunctionEnvironmentVariable.belongsTo(models.Function, { foreignKey: 'function_id' });
  };

  return FunctionEnvironmentVariable;
};
