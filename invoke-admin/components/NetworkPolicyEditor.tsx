import { useState, useEffect } from 'react';
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ipaddr = require('ipaddr.js');
const minimatch = require('minimatch');

interface NetworkPolicyRule {
  action: 'allow' | 'deny';
  target_type: 'ip' | 'cidr' | 'domain';
  target_value: string;
  description?: string;
  priority: number;
  id?: string; // For UI tracking
}

interface NetworkPolicyEditorProps {
  rules: NetworkPolicyRule[];
  onChange: (rules: NetworkPolicyRule[]) => void;
  onSave: () => void;
  saving: boolean;
  onTestConnection?: (host: string) => Promise<{ allowed: boolean; reason: string }>;
}

// Sortable row component
function SortableRuleRow({ 
  rule, 
  index, 
  onDelete, 
  onUpdate 
}: { 
  rule: NetworkPolicyRule; 
  index: number; 
  onDelete: () => void;
  onUpdate: (updates: Partial<NetworkPolicyRule>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id || `rule-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [validationError, setValidationError] = useState<string>('');
  const [validationTimeout, setValidationTimeout] = useState<NodeJS.Timeout | null>(null);

  // Validate target value with debounce
  const validateTarget = (value: string, type: string) => {
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    const timeout = setTimeout(() => {
      let error = '';
      
      if (!value.trim()) {
        error = 'Target value is required';
      } else if (type === 'ip') {
        if (!ipaddr.isValid(value)) {
          error = 'Invalid IP address';
        }
      } else if (type === 'cidr') {
        try {
          ipaddr.parseCIDR(value);
        } catch (e) {
          error = 'Invalid CIDR notation (e.g., 192.168.0.0/16)';
        }
      } else if (type === 'domain') {
        // Basic domain validation
        if (!/^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(value)) {
          error = 'Invalid domain format';
        }
      }
      
      setValidationError(error);
    }, 500);

    setValidationTimeout(timeout);
  };

  useEffect(() => {
    validateTarget(rule.target_value, rule.target_type);
    return () => {
      if (validationTimeout) clearTimeout(validationTimeout);
    };
  }, [rule.target_value, rule.target_type]);

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-700">
      <td className="p-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="p-3 text-gray-300">{index + 1}</td>
      <td className="p-3">
        <select
          value={rule.action}
          onChange={(e) => onUpdate({ action: e.target.value as 'allow' | 'deny' })}
          className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm"
        >
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
      </td>
      <td className="p-3">
        <span
          className={`px-2 py-1 text-xs rounded ${
            rule.action === 'allow'
              ? 'bg-green-900/30 text-green-400 border border-green-800'
              : 'bg-red-900/30 text-red-400 border border-red-800'
          }`}
        >
          {rule.action === 'allow' ? 'Allow' : 'Deny'}
        </span>
      </td>
      <td className="p-3">
        <select
          value={rule.target_type}
          onChange={(e) => {
            onUpdate({ target_type: e.target.value as 'ip' | 'cidr' | 'domain' });
            validateTarget(rule.target_value, e.target.value);
          }}
          className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-sm"
        >
          <option value="ip">IP Address</option>
          <option value="cidr">CIDR Block</option>
          <option value="domain">Domain</option>
        </select>
      </td>
      <td className="p-3">
        <div className="space-y-1">
          <input
            type="text"
            value={rule.target_value}
            onChange={(e) => {
              onUpdate({ target_value: e.target.value });
              validateTarget(e.target.value, rule.target_type);
            }}
            placeholder={
              rule.target_type === 'ip' ? '192.168.1.1' :
              rule.target_type === 'cidr' ? '192.168.0.0/16' :
              '*.example.com'
            }
            className={`w-full bg-gray-700 border ${
              validationError ? 'border-red-500' : 'border-gray-600'
            } rounded px-3 py-1.5 text-sm`}
          />
          {validationError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {validationError}
            </p>
          )}
          {rule.target_type === 'domain' && !validationError && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              Wildcards supported: *.example.com
            </p>
          )}
        </div>
      </td>
      <td className="p-3">
        <input
          type="text"
          value={rule.description || ''}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="Optional description"
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm"
        />
      </td>
      <td className="p-3">
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
          title="Delete rule"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}

export default function NetworkPolicyEditor({
  rules,
  onChange,
  onSave,
  saving,
  onTestConnection
}: NetworkPolicyEditorProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [testHost, setTestHost] = useState('');
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Add unique IDs to rules for drag-and-drop
  const rulesWithIds = rules.map((rule, index) => ({
    ...rule,
    id: rule.id || `rule-${index}`
  }));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = rulesWithIds.findIndex((r) => r.id === active.id);
      const newIndex = rulesWithIds.findIndex((r) => r.id === over.id);

      const reordered = arrayMove(rulesWithIds, oldIndex, newIndex);
      // Renumber priorities
      const renumbered = reordered.map((rule, index) => ({
        ...rule,
        priority: index + 1
      }));
      onChange(renumbered);
    }
  };

  const handleAddRule = () => {
    const newRule: NetworkPolicyRule = {
      action: 'allow',
      target_type: 'cidr',
      target_value: '',
      description: '',
      priority: rules.length + 1,
      id: `rule-${Date.now()}`
    };
    onChange([...rules, newRule]);
    setShowAddModal(false);
  };

  const handleDeleteRule = (index: number) => {
    const updated = rules.filter((_, i) => i !== index);
    // Renumber priorities
    const renumbered = updated.map((rule, i) => ({
      ...rule,
      priority: i + 1
    }));
    onChange(renumbered);
  };

  const handleUpdateRule = (index: number, updates: Partial<NetworkPolicyRule>) => {
    const updated = rules.map((rule, i) =>
      i === index ? { ...rule, ...updates } : rule
    );
    onChange(updated);
  };

  const handleTestConnection = async () => {
    if (!onTestConnection || !testHost.trim()) return;
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const result = await onTestConnection(testHost);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        allowed: false,
        reason: 'Test failed: ' + (err instanceof Error ? err.message : String(err))
      });
    } finally {
      setTesting(false);
    }
  };

  const hasValidationErrors = rulesWithIds.some(rule => !rule.target_value.trim());

  return (
    <div className="space-y-6">
      {/* Warning banner if no rules */}
      {rules.length === 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-red-400 font-medium">At least one policy rule is required</p>
            <p className="text-red-300 mt-1">
              Without any rules, all network connections will be blocked by default.
            </p>
          </div>
        </div>
      )}

      {/* Policy Rules Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-200">Network Policy Rules</h3>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Rule
          </button>
        </div>

        {rules.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rulesWithIds.map(r => r.id!)}
              strategy={verticalListSortingStrategy}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900/50">
                    <tr>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-12"></th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-16">Priority</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Badge</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Type</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Target</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Description</th>
                      <th className="p-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800">
                    {rulesWithIds.map((rule, index) => (
                      <SortableRuleRow
                        key={rule.id}
                        rule={rule}
                        index={index}
                        onDelete={() => handleDeleteRule(index)}
                        onUpdate={(updates) => handleUpdateRule(index, updates)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p>No policy rules configured. Click "Add Rule" to get started.</p>
          </div>
        )}
      </div>

      {/* Test Connection */}
      {onTestConnection && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">Test Connection</h3>
          <div className="flex gap-3">
            <input
              type="text"
              value={testHost}
              onChange={(e) => setTestHost(e.target.value)}
              placeholder="Enter hostname or IP (e.g., example.com, 8.8.8.8)"
              className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-sm"
              onKeyPress={(e) => e.key === 'Enter' && handleTestConnection()}
            />
            <button
              onClick={handleTestConnection}
              disabled={testing || !testHost.trim()}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing...' : 'Test'}
            </button>
          </div>
          {testResult && (
            <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 ${
              testResult.allowed 
                ? 'bg-green-900/20 border border-green-800' 
                : 'bg-red-900/20 border border-red-800'
            }`}>
              {testResult.allowed ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="text-sm">
                <p className={testResult.allowed ? 'text-green-400' : 'text-red-400'}>
                  <span className="font-medium">
                    {testResult.allowed ? 'Connection Allowed' : 'Connection Blocked'}
                  </span>
                </p>
                <p className="text-gray-300 mt-1">{testResult.reason}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3">
        {rules.length === 0 && (
          <p className="text-sm text-red-400">Cannot save without at least one rule</p>
        )}
        <button
          onClick={onSave}
          disabled={saving || rules.length === 0 || hasValidationErrors}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Policy'}
        </button>
      </div>

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-gray-200 mb-4">Add New Rule</h3>
            <p className="text-gray-400 text-sm mb-4">
              A new rule will be added at the end. You can reorder it by dragging after saving.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRule}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
              >
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
