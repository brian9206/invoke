import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown, FolderOpen } from 'lucide-react';
import { authenticatedFetch } from '@/lib/frontend-utils';

interface Project {
  id: string;
  name: string;
  description: string;
  role: string;
}

interface ProjectSelectorProps {
  selectedProjectId?: string;
  onProjectChange: (projectId: string) => void;
  className?: string;
}

export default function ProjectSelector({ selectedProjectId, onProjectChange, className = '' }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await authenticatedFetch('/api/my-projects');

      if (response.ok) {
        const data = await response.json();
        const projectsList = Array.isArray(data) ? data : (data?.projects || []);
        setProjects(projectsList);

        // Auto-select first project if none selected
        if (!selectedProjectId && projectsList.length > 0) {
          onProjectChange(projectsList[0].id);
        }
      } else {
        console.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-700 rounded-md h-10 w-48 ${className}`} />
    );
  }

  if (projects.length === 0) {
    return (
      <div className={`text-gray-400 text-sm ${className}`}>
        No projects available
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center justify-between w-full px-4 py-2 text-left bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
      >
        <div className="flex items-center">
          <FolderOpen className="w-4 h-4 mr-2" />
          <span className="truncate">
            {selectedProject ? selectedProject.name : 'Select Project'}
          </span>
          {selectedProject && (
            <span className="ml-2 px-2 py-1 text-xs bg-blue-600 text-white rounded-full">
              {selectedProject.role}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 transform transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg">
          <div className="py-1">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  onProjectChange(project.id);
                  setShowDropdown(false);
                }}
                className={`w-full px-4 py-2 text-left hover:bg-gray-700 transition-colors ${
                  selectedProjectId === project.id ? 'bg-gray-700' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FolderOpen className="w-4 h-4 mr-2 text-gray-400" />
                    <div>
                      <span className="text-white">{project.name}</span>
                      {project.description && (
                        <p className="text-xs text-gray-400 truncate">{project.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 bg-blue-600 text-white rounded-full">
                    {project.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}