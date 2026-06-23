const { Model, DataTypes } = require('sequelize')

module.exports = sequelize => {
  class ProjectEnvironmentVariable extends Model {}

  ProjectEnvironmentVariable.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE'
      },
      variable_name: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      variable_value: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT
      },
      created_at: {
        type: DataTypes.DATE
      },
      updated_at: {
        type: DataTypes.DATE
      }
    },
    {
      sequelize,
      modelName: 'ProjectEnvironmentVariable',
      tableName: 'project_environment_variables',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
      indexes: [{ unique: true, fields: ['project_id', 'variable_name'] }]
    }
  )

  ProjectEnvironmentVariable.associate = models => {
    ProjectEnvironmentVariable.belongsTo(models.Project, { foreignKey: 'project_id' })
  }

  return ProjectEnvironmentVariable
}
