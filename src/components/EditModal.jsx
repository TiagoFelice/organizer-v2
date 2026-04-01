import React, { useState, useEffect } from 'react';

function EditModal({ task, users, onClose, onSave }) {
  const [formData, setFormData] = useState({
    taskName: task.name || '',
    frequency: task.frequency || 'none',
    customDays: task.intervalDays || '',
    currentAssignee: task.currentAssignee || '',
    nextDue: task.nextDue ? task.nextDue.split('T')[0] : '',
    participants: task.participants || users
  });

  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showCustomFrequency, setShowCustomFrequency] = useState(task.frequency === 'custom');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'frequency') {
      setShowCustomFrequency(value === 'custom');
    }
  };

  const handleParticipantReorder = (fromIndex, toIndex) => {
    const newParticipants = [...formData.participants];
    const [removed] = newParticipants.splice(fromIndex, 1);
    newParticipants.splice(toIndex, 0, removed);
    setFormData(prev => ({
      ...prev,
      participants: newParticipants
    }));
  };

  const removeParticipant = (index) => {
    if (formData.participants.length <= 1) {
      alert('Deve haver pelo menos um participante');
      return;
    }
    const newParticipants = formData.participants.filter((_, i) => i !== index);
    setFormData(prev => ({
      ...prev,
      participants: newParticipants
    }));
  };

  const addParticipant = (user) => {
    if (formData.participants.includes(user)) {
      alert('Este participante já está na lista');
      return;
    }
    setFormData(prev => ({
      ...prev,
      participants: [...prev.participants, user]
    }));
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (toIndex) => {
    if (draggedIndex !== null && draggedIndex !== toIndex) {
      handleParticipantReorder(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.taskName.trim()) {
      alert('Nome da tarefa é obrigatório');
      return;
    }

    if (formData.frequency === 'custom' && (!formData.customDays || formData.customDays < 1)) {
      alert('Intervalo personalizado deve ser maior que 0');
      return;
    }

    if (formData.participants.length === 0) {
      alert('Deve haver pelo menos um participante');
      return;
    }

    let intervalDays = null;
    let nextDue = null;

    // If manual date is set, use it
    if (formData.nextDue) {
      const dueDate = new Date(formData.nextDue + 'T00:00:00');
      nextDue = dueDate.toISOString();
    } else if (formData.frequency && formData.frequency !== 'none') {
      // Otherwise, calculate based on frequency
      switch (formData.frequency) {
        case 'daily':
          intervalDays = 1;
          break;
        case 'weekly':
          intervalDays = 7;
          break;
        case 'custom':
          intervalDays = parseInt(formData.customDays);
          break;
      }

      if (intervalDays) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const nextDueDate = new Date(today.getTime() + intervalDays * 24 * 60 * 60 * 1000);
        nextDue = nextDueDate.toISOString();
      }
    }

    const newAssigneeIndex = formData.participants.indexOf(formData.currentAssignee);

    const updates = {
      name: formData.taskName.trim(),
      frequency: formData.frequency || 'none',
      intervalDays: intervalDays,
      participants: formData.participants,
      nextDue: nextDue,
      currentAssignee: formData.currentAssignee,
      assigneeIndex: newAssigneeIndex >= 0 ? newAssigneeIndex : 0
    };

    onSave(updates);
  };

  const getUnlistedUsers = () => {
    return users.filter(user => !formData.participants.includes(user));
  };

  return (
    <div id="editModal" className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Editar Tarefa</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form id="editTaskForm" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="editTaskName">Nome da Tarefa *</label>
            <input
              type="text"
              id="editTaskName"
              name="taskName"
              value={formData.taskName}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="editFrequency">Frequência *</label>
            <select
              id="editFrequency"
              name="frequency"
              value={formData.frequency}
              onChange={handleInputChange}
            >
              <option value="none">Sem prazo</option>
              <option value="daily">Diária</option>
              <option value="weekly">Semanal</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {showCustomFrequency && (
            <div id="editCustomFrequencyGroup" className="form-group">
              <label htmlFor="editCustomDays">Intervalo (dias) *</label>
              <input
                type="number"
                id="editCustomDays"
                name="customDays"
                value={formData.customDays}
                onChange={handleInputChange}
                min="1"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="editNextDue">Próximo Vencimento</label>
            <input
              type="date"
              id="editNextDue"
              name="nextDue"
              value={formData.nextDue}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="editCurrentAssignee">Responsável Atual *</label>
            <select
              id="editCurrentAssignee"
              name="currentAssignee"
              value={formData.currentAssignee}
              onChange={handleInputChange}
            >
              {formData.participants.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Participantes * (Arraste para reordenar)</label>
            <div id="editParticipantsList" className="participants-list">
              {formData.participants.map((participant, index) => (
                <div 
                  key={index} 
                  className={`participant-item ${draggedIndex === index ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="drag-handle">☰</span>
                  <span className="participant-name">{participant}</span>
                  <button
                    type="button"
                    className="btn-remove-participant"
                    onClick={() => removeParticipant(index)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {getUnlistedUsers().length > 0 && (
              <div className="form-group">
                <label htmlFor="editAddParticipant">Adicionar Participante</label>
                <select
                  id="editAddParticipant"
                  onChange={(e) => {
                    addParticipant(e.target.value);
                    e.target.value = '';
                  }}
                >
                  <option value="">Selecione um participante</option>
                  {getUnlistedUsers().map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="submit" className="btn btn-primary">
              Salvar Alterações
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditModal;
