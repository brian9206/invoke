'use strict'

module.exports = {
  async up({ context: { queryInterface } }) {
    // 1. Add language and runtime columns to functions table
    await queryInterface.addColumn('functions', 'language', {
      type: 'VARCHAR(50)',
      allowNull: false,
      defaultValue: 'javascript'
    })

    await queryInterface.addColumn('functions', 'runtime', {
      type: 'VARCHAR(50)',
      allowNull: false,
      defaultValue: 'bun'
    })

    // 2. Add build-related columns to function_versions
    await queryInterface.addColumn('function_versions', 'artifact_path', {
      type: 'VARCHAR(500)',
      allowNull: true
    })

    await queryInterface.addColumn('function_versions', 'artifact_hash', {
      type: 'VARCHAR(64)',
      allowNull: true
    })

    await queryInterface.addColumn('function_versions', 'build_status', {
      type: 'VARCHAR(20)',
      allowNull: false,
      defaultValue: 'none'
    })

    // 3. Create function_builds table
    await queryInterface.createTable('function_builds', {
      id: {
        type: 'UUID',
        primaryKey: true,
        defaultValue: queryInterface.sequelize.literal('gen_random_uuid()')
      },
      function_id: {
        type: 'UUID',
        allowNull: false,
        references: { model: 'functions', key: 'id' },
        onDelete: 'CASCADE'
      },
      version_id: {
        type: 'UUID',
        allowNull: false,
        references: { model: 'function_versions', key: 'id' },
        onDelete: 'CASCADE'
      },
      status: {
        type: 'VARCHAR(20)',
        allowNull: false,
        defaultValue: 'queued'
      },
      pipeline: {
        type: 'VARCHAR(50)',
        allowNull: false,
        defaultValue: 'bun-javascript'
      },
      after_build_action: {
        type: 'VARCHAR(20)',
        allowNull: false,
        defaultValue: 'none'
      },
      artifact_path: {
        type: 'VARCHAR(500)',
        allowNull: true
      },
      artifact_hash: {
        type: 'VARCHAR(64)',
        allowNull: true
      },
      build_context: {
        type: 'JSONB',
        allowNull: true,
        defaultValue: null
      },
      error_message: {
        type: 'TEXT',
        allowNull: true
      },
      created_by: {
        type: 'INTEGER',
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL'
      },
      created_at: {
        type: 'TIMESTAMP WITH TIME ZONE',
        allowNull: false,
        defaultValue: queryInterface.sequelize.literal('NOW()')
      },
      started_at: {
        type: 'TIMESTAMP WITH TIME ZONE',
        allowNull: true
      },
      completed_at: {
        type: 'TIMESTAMP WITH TIME ZONE',
        allowNull: true
      }
    })

    await queryInterface.addIndex('function_builds', ['function_id'])
    await queryInterface.addIndex('function_builds', ['version_id'])
    await queryInterface.addIndex('function_builds', ['status', 'created_at'])

    // 4. Insert global_settings using queryInterface
    await queryInterface.bulkInsert(
      'global_settings',
      [
        {
          setting_key: 'max_concurrent_builds',
          setting_value: '2',
          description: 'Maximum number of concurrent build jobs',
          updated_at: new Date()
        },
        {
          setting_key: 'build_memory_mb',
          setting_value: '1024',
          description: 'Memory limit for build sandbox in MB.',
          updated_at: new Date()
        }
      ],
      {
        ignoreDuplicates: true
      }
    )

    // 5. Add pg-notify trigger on function_builds changes (raw SQL required for PL/pgSQL)
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION notify_build_queue_change()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('build_queue_updated', json_build_object(
          'action', TG_OP,
          'build_id', COALESCE(NEW.id, OLD.id),
          'status', COALESCE(NEW.status, OLD.status)
        )::text);
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trig_notify_build_queue ON function_builds;
      CREATE TRIGGER trig_notify_build_queue
        AFTER INSERT OR UPDATE OF status
        ON function_builds
        FOR EACH ROW EXECUTE FUNCTION notify_build_queue_change();
    `)
  },

  async down({ context: { queryInterface } }) {
    // Reverse order of operations in up()
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trig_notify_build_queue ON function_builds;
      DROP FUNCTION IF EXISTS notify_build_queue_change();
    `)

    await queryInterface.bulkDelete(
      'global_settings',
      {
        setting_key: ['max_concurrent_builds', 'build_memory_mb']
      },
      {}
    )

    await queryInterface.dropTable('function_builds')

    await queryInterface.removeColumn('function_versions', 'build_status')
    await queryInterface.removeColumn('function_versions', 'artifact_hash')
    await queryInterface.removeColumn('function_versions', 'artifact_path')

    await queryInterface.removeColumn('functions', 'runtime')
    await queryInterface.removeColumn('functions', 'language')
  }
}
