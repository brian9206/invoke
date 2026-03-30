import { Model, DataTypes, Sequelize, ModelStatic } from 'sequelize';

export class FunctionLog extends Model {
  declare id: number;
  declare function_id: string | null;
  declare project_id: string;
  declare type: string;
  declare source: string;
  declare executed_at: Date;
  declare payload: Record<string, unknown>;
}

export function initFunctionLogModel(sequelize: Sequelize): ModelStatic<FunctionLog> {
  FunctionLog.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      function_id: {
        type: DataTypes.UUID,
        allowNull: true,
        // No FK reference — cross-DB FK constraints not possible
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        // No FK reference
      },
      type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'request',
      },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'execution',
      },
      executed_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      payload: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'FunctionLog',
      tableName: 'function_logs',
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    },
  );

  return FunctionLog;
}
