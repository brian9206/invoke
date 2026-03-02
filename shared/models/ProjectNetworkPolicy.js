const { DataTypes } = require('sequelize');
const { defineNetworkPolicy } = require('./NetworkPolicyBase');

module.exports = (sequelize) => {
  const ProjectNetworkPolicy = defineNetworkPolicy(
    sequelize,
    'project_network_policies',
    'ProjectNetworkPolicy',
    {
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
    }
  );

  ProjectNetworkPolicy.associate = (models) => {
    ProjectNetworkPolicy.belongsTo(models.Project, { foreignKey: 'project_id' });
  };

  return ProjectNetworkPolicy;
};
