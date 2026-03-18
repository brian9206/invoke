const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class FunctionGroup extends Model {}

  FunctionGroup.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      sort_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
      modelName: 'FunctionGroup',
      tableName: 'function_groups',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  FunctionGroup.associate = (models) => {
    FunctionGroup.belongsTo(models.Project, { foreignKey: 'project_id' });
    FunctionGroup.hasMany(models.Function, { foreignKey: 'group_id', as: 'functions' });
  };

  return FunctionGroup;
};
