import React, { useState } from 'react';

function TaskForm({ users, onCreateTask }) {
  const [formData, setFormData] = useState({
    taskName: '',
    frequency: 'none',
    customDays: '',
    participants: []
  });

  const [showCustomFrequency, setShowCustomFrequency] = useState(false);

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

  const handleParticipantChange = (e) => {
    const { value, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      participants: checked
        ? [...prev.participants, value]
        : prev.participants.filter(p => p !== value)
    }));
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
      alert('Selecione pelo menos um participante');
      return;
    }

    onCreateTask({
      taskName: formData.taskName.trim(),
      frequency: formData.frequency,
      customDays: formData.customDays,
      participants: formData.participants
    });

    // Reset form
    setFormData({
      taskName: '',
      frequency: 'none',
      customDays: '',
      participants: []
    });
    setShowCustomFrequency(false);
  };

  return (
    <div className="form-container">
      <h2>Criar Nova Tarefa</h2>
      
      <form id="taskForm" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="taskName">Nome da Tarefa *</label>
          <input
            type="text"
            id="taskName"
            name="taskName"
            value={formData.taskName}
            onChange={handleInputChange}
            placeholder="Ex: Lavar louça"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="frequency">Frequência *</label>
          <select
            id="frequency"
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
          <div id="customFrequencyGroup" className="form-group">
            <label htmlFor="customDays">Intervalo (dias) *</label>
            <input
              type="number"
              id="customDays"
              name="customDays"
              value={formData.customDays}
              onChange={handleInputChange}
              min="1"
              placeholder="Ex: 3"
            />
          </div>
        )}

        <div className="form-group">
          <label>Participantes *</label>
          <div className="checkbox-group">
            {users.map(user => (
              <label key={user} className="checkbox-label">
                <input
                  type="checkbox"
                  className="participant-checkbox"
                  value={user}
                  checked={formData.participants.includes(user)}
                  onChange={handleParticipantChange}
                />
                {user}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary">
          Criar Tarefa
        </button>
      </form>
    </div>
  );
}

export default TaskForm;
