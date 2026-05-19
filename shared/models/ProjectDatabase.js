const { Model, DataTypes } = require('sequelize')

module.exports = sequelize => {
  class ProjectDatabase extends Model {}

  ProjectDatabase.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'projects', key: 'id' }
      },
      db_name: {
        type: DataTypes.STRING(63),
        allowNull: false
      },
      app_username: {
        type: DataTypes.STRING(63),
        allowNull: false
      },
      admin_username: {
        type: DataTypes.STRING(63),
        allowNull: false
      },
      app_password_encrypted: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      admin_password_encrypted: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'initialized'
      },
      storage_locked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      initialized_at: {
        type: DataTypes.DATE
      },
      initialized_by: {
        type: DataTypes.INTEGER,
        references: { model: 'users', key: 'id' }
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
      modelName: 'ProjectDatabase',
      tableName: 'project_databases',
      timestamps: false,
      underscored: true,
      freezeTableName: true
    }
  )

  ProjectDatabase.associate = models => {
    ProjectDatabase.belongsTo(models.Project, { foreignKey: 'project_id', as: 'project' })
    ProjectDatabase.belongsTo(models.User, { foreignKey: 'initialized_by', as: 'initializer' })
  }

  return ProjectDatabase
}
