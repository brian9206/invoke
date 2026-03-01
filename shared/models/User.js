const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class User extends Model {}

  User.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      is_admin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
      last_login: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    }
  );

  User.associate = (models) => {
    User.hasMany(models.ProjectMembership, { foreignKey: 'user_id' });
    User.hasMany(models.Project, { foreignKey: 'created_by', as: 'ownedProjects' });
    User.hasMany(models.ApiKey, { foreignKey: 'created_by', as: 'apiKeys' });
    User.hasMany(models.FunctionVersion, { foreignKey: 'created_by', as: 'deployedVersions' });
  };

  return User;
};
