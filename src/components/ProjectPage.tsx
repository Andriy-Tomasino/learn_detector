import React, { useState, useEffect } from 'react';
import { exportProject, type VideoProject } from '../utils/storage';
import { loadAllProjectsFromDB, deleteProjectFromDB, getProjectFile } from '../utils/database';
import './ProjectPage.css';

interface ProjectPageProps {
  onProjectSelect: (project: VideoProject) => void;
}

export const ProjectPage: React.FC<ProjectPageProps> = ({ onProjectSelect }) => {
  const [projects, setProjects] = useState<{ [key: string]: VideoProject }>({});
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projectsList = await loadAllProjectsFromDB();
      const projectsMap: { [key: string]: VideoProject } = {};
      projectsList.forEach((project) => {
        projectsMap[project.id] = project;
      });
      setProjects(projectsMap);
    } catch (error) {
      console.error('Error loading projects:', error);
      alert('Error loading projects from database.');
    }
  };

  const handleDelete = async (videoId: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProjectFromDB(videoId);
        loadProjects();
        if (selectedProject?.id === videoId) {
          setSelectedProject(null);
        }
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Error deleting project.');
      }
    }
  };

  const handleExport = (project: VideoProject) => {
    exportProject(project);
  };

  const handleSelect = (project: VideoProject) => {
    setSelectedProject(project);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('en-US');
  };

  const getTotalRectangles = (project: VideoProject): number => {
    let total = 0;
    Object.values(project.annotations.frames).forEach((rects) => {
      total += rects.length;
    });
    return total;
  };

  const projectList = Object.values(projects);

  return (
    <div className="project-page">
      <div className="project-header">
        <h2>All Projects</h2>
        <div className="project-count">{projectList.length} projects</div>
      </div>

      <div className="project-content">
        <div className="project-list">
          {projectList.length === 0 ? (
            <div className="empty-projects">
              <p>No saved projects</p>
              <p className="hint">Go to the Task tab and save a project</p>
            </div>
          ) : (
            projectList.map((project) => (
              <div
                key={project.id}
                className={`project-card ${selectedProject?.id === project.id ? 'selected' : ''}`}
                onClick={() => handleSelect(project)}
              >
              <div className="project-card-header">
                <div className="project-card-title">{project.fileName}</div>
                <div className="project-card-actions">
                  <button
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onProjectSelect(project);
                    }}
                    title="Edit"
                  >
                    ✏
                  </button>
                  <button
                    className="export-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(project);
                    }}
                    title="Export"
                  >
                    ⬇
                  </button>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
                <div className="project-card-info">
                  <div className="info-item">
                    <span className="info-label">Size:</span>
                    <span className="info-value">{formatFileSize(project.fileSize)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Type:</span>
                    <span className="info-value">{project.fileType}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Annotations:</span>
                    <span className="info-value">{getTotalRectangles(project)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Updated:</span>
                    <span className="info-value">{formatDate(project.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedProject && (
          <div className="project-details">
            <h3>Project Details</h3>
            <div className="details-content">
              <div className="detail-section">
                <h4>File Information</h4>
                <div className="detail-item">
                  <span>Name:</span>
                  <span>{selectedProject.fileName}</span>
                </div>
                <div className="detail-item">
                  <span>Size:</span>
                  <span>{formatFileSize(selectedProject.fileSize)}</span>
                </div>
                <div className="detail-item">
                  <span>Type:</span>
                  <span>{selectedProject.fileType}</span>
                </div>
                <div className="detail-item">
                  <span>Created:</span>
                  <span>{formatDate(selectedProject.createdAt)}</span>
                </div>
                <div className="detail-item">
                  <span>Updated:</span>
                  <span>{formatDate(selectedProject.updatedAt)}</span>
                </div>
              </div>

              <div className="detail-section">
                <h4>Annotation Statistics</h4>
                <div className="detail-item">
                  <span>Total Objects:</span>
                  <span>{getTotalRectangles(selectedProject)}</span>
                </div>
                <div className="detail-item">
                  <span>Frames with Annotations:</span>
                  <span>
                    {Object.keys(selectedProject.annotations.frames).filter(
                      (key) => selectedProject.annotations.frames[key].length > 0
                    ).length}
                  </span>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="edit-detail-btn"
                  onClick={() => onProjectSelect(selectedProject)}
                >
                  Edit
                </button>
                <button
                  className="export-detail-btn"
                  onClick={() => handleExport(selectedProject)}
                >
                  Export JSON
                </button>
                <button
                  className="delete-detail-btn"
                  onClick={() => handleDelete(selectedProject.id)}
                >
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

