import { Model, DataTypes, Sequelize, ModelStatic } from 'sequelize'

export class PayloadField extends Model {
  declare id: number
  declare project_id: string
  declare field_path: string
  declare field_type: string
  declare first_seen_at: Date
  declare last_seen_at: Date
}

export function initPayloadFieldModel(sequelize: Sequelize): ModelStatic<PayloadField> {
  PayloadField.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false
      },
      field_path: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      field_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'string'
      },
      first_seen_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      last_seen_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    },
    {
      sequelize,
      modelName: 'PayloadField',
      tableName: 'payload_fields',
      timestamps: false,
      underscored: true,
      freezeTableName: true
    }
  )
  return PayloadField
}
