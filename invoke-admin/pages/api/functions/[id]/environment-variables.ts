// API endpoints for managing function environment variables
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuthAndMethods, AuthenticatedRequest } from '@/lib/middleware';
import db from '@/lib/database';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
    const { id: functionId } = req.query;

    if (!functionId || typeof functionId !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Function ID is required'
        });
    }

    // Verify function exists
    try {
        const functionCheck = await db.query(
            'SELECT id FROM functions WHERE id = $1',
            [functionId]
        );

        if (functionCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Function not found'
            });
        }
    } catch (error) {
        console.error('Error checking function:', error);
        return res.status(500).json({
            success: false,
            message: 'Database error'
        });
    }

    switch (req.method) {
        case 'GET':
            await handleGetEnvironmentVariables(req, res, functionId);
            break;
        case 'PUT':
            await handleUpdateEnvironmentVariables(req, res, functionId);
            break;
        case 'POST':
            await handleAddEnvironmentVariable(req, res, functionId);
            break;
        case 'DELETE':
            await handleDeleteEnvironmentVariable(req, res, functionId);
            break;
        default:
            res.setHeader('Allow', ['GET', 'PUT', 'POST', 'DELETE']);
            res.status(405).json({
                success: false,
                message: `Method ${req.method} not allowed`
            });
            break;
    }
}

async function handleGetEnvironmentVariables(req: NextApiRequest, res: NextApiResponse, functionId: string) {
    try {
        const result = await db.query(`
            SELECT 
                id,
                variable_name,
                variable_value,
                description,
                created_at,
                updated_at
            FROM function_environment_variables 
            WHERE function_id = $1 
            ORDER BY variable_name ASC
        `, [functionId]);

        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching environment variables:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch environment variables'
        });
    }
}

async function handleUpdateEnvironmentVariables(req: NextApiRequest, res: NextApiResponse, functionId: string) {
    const { variables } = req.body;

    if (!Array.isArray(variables)) {
        return res.status(400).json({
            success: false,
            message: 'Variables must be an array'
        });
    }

    // Validate variables format
    for (const variable of variables) {
        if (!variable.variable_name || typeof variable.variable_name !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Each variable must have a valid variable_name'
            });
        }
        if (variable.variable_value === undefined || variable.variable_value === null) {
            return res.status(400).json({
                success: false,
                message: 'Each variable must have a variable_value'
            });
        }
        
        // Validate environment variable name format
        if (!/^[A-Z_][A-Z0-9_]*$/i.test(variable.variable_name)) {
            return res.status(400).json({
                success: false,
                message: `Invalid variable name: ${variable.variable_name}. Must contain only letters, numbers, and underscores, and cannot start with a number.`
            });
        }
    }

    try {
        await db.transaction(async (client) => {
            // Delete existing environment variables for this function
            await client.query(
                'DELETE FROM function_environment_variables WHERE function_id = $1',
                [functionId]
            );

            // Insert new environment variables
            if (variables.length > 0) {
                for (const variable of variables) {
                    await client.query(`
                        INSERT INTO function_environment_variables 
                        (function_id, variable_name, variable_value, description) 
                        VALUES ($1, $2, $3, $4)
                    `, [
                        functionId,
                        variable.variable_name,
                        String(variable.variable_value),
                        variable.description || null
                    ]);
                }
            }
        });

        res.status(200).json({
            success: true,
            message: 'Environment variables updated successfully'
        });
    } catch (error) {
        console.error('Error updating environment variables:', error);
        
        if (error.code === '23505') { // Unique constraint violation
            res.status(400).json({
                success: false,
                message: 'Duplicate variable name found'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update environment variables'
            });
        }
    }
}

async function handleAddEnvironmentVariable(req: NextApiRequest, res: NextApiResponse, functionId: string) {
    const { variable_name, variable_value, description } = req.body;

    if (!variable_name || typeof variable_name !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Variable name is required'
        });
    }

    if (variable_value === undefined || variable_value === null) {
        return res.status(400).json({
            success: false,
            message: 'Variable value is required'
        });
    }

    // Validate environment variable name format
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(variable_name)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid variable name. Must contain only letters, numbers, and underscores, and cannot start with a number.'
        });
    }

    try {
        await db.query(`
            INSERT INTO function_environment_variables 
            (function_id, variable_name, variable_value, description) 
            VALUES ($1, $2, $3, $4)
        `, [
            functionId,
            variable_name,
            String(variable_value),
            description || null
        ]);

        res.status(201).json({
            success: true,
            message: 'Environment variable added successfully'
        });
    } catch (error) {
        console.error('Error adding environment variable:', error);
        
        if (error.code === '23505') { // Unique constraint violation
            res.status(400).json({
                success: false,
                message: 'Variable with this name already exists'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to add environment variable'
            });
        }
    }
}

async function handleDeleteEnvironmentVariable(req: NextApiRequest, res: NextApiResponse, functionId: string) {
    const { variable_name } = req.query;

    if (!variable_name || typeof variable_name !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Variable name is required'
        });
    }

    try {
        const result = await db.query(
            'DELETE FROM function_environment_variables WHERE function_id = $1 AND variable_name = $2',
            [functionId, variable_name]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Environment variable not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Environment variable deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting environment variable:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete environment variable'
        });
    }
}

export default withAuthAndMethods(['GET', 'PUT', 'POST', 'DELETE'])(handler);