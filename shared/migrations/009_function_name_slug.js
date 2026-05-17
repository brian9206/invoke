'use strict'

const { default: slugify } = require('@sindresorhus/slugify')

module.exports = {
  async up({ context: { queryInterface } }) {
    const { DataTypes } = require('sequelize')

    // Remove the existing non-unique index on functions.name
    await queryInterface.removeIndex('functions', 'functions_name')

    // Add composite unique constraint: function names must be unique per project
    await queryInterface.addConstraint('functions', {
      fields: ['project_id', 'name'],
      type: 'unique',
      name: 'functions_project_id_name_unique'
    })

    // ── Add slug column to projects ──────────────────────────────────────────
    await queryInterface.addColumn('projects', 'slug', {
      type: DataTypes.STRING(120),
      allowNull: true,
      unique: false
    })

    // Backfill slugs from existing project names
    const [projects] = await queryInterface.sequelize.query('SELECT id, name FROM projects')

    const usedSlugs = new Set()
    for (const project of projects) {
      let base = slugify(project.name) || 'project'
      let slug = base
      let counter = 1
      while (usedSlugs.has(slug)) {
        slug = `${base}-${counter}`
        counter++
      }
      usedSlugs.add(slug)
      await queryInterface.sequelize.query('UPDATE projects SET slug = :slug WHERE id = :id', {
        replacements: { slug, id: project.id }
      })
    }

    // Make slug NOT NULL and add unique index
    await queryInterface.changeColumn('projects', 'slug', {
      type: DataTypes.STRING(120),
      allowNull: false
    })

    await queryInterface.addIndex('projects', ['slug'], {
      unique: true,
      name: 'projects_slug_unique'
    })
  },

  async down({ context: { queryInterface } }) {
    // Remove slug column and index
    await queryInterface.removeIndex('projects', 'projects_slug_unique')
    await queryInterface.removeColumn('projects', 'slug')

    // Remove the composite unique constraint
    await queryInterface.removeConstraint('functions', 'functions_project_id_name_unique')

    // Re-add the original non-unique index on name
    await queryInterface.addIndex('functions', ['name'], {
      name: 'functions_name'
    })
  }
}
