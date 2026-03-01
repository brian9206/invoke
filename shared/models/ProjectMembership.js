const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class ProjectMembership extends Model {}

  ProjectMembership.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [['owner', 'developer']] },
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
      modelName: 'ProjectMembership',
      tableName: 'project_memberships',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [{ unique: true, fields: ['project_id', 'user_id'] }],
    }
  );

  ProjectMembership.associate = (models) => {
    ProjectMembership.belongsTo(models.Project, { foreignKey: 'project_id' });
    ProjectMembership.belongsTo(models.User, { foreignKey: 'user_id' });
  };

  return ProjectMembership;
};
