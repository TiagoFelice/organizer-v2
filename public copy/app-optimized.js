// Organizador de Tarefas Domésticas - JavaScript Otimizado

class TaskManager {
  constructor() {
    this.db = null;
    this.users = ['Tiago', 'Caio'];
    this.init();
  }

  async init() {
    // Aguardar o Firebase estar disponível
    if (typeof firebase === 'undefined') {
      setTimeout(() => this.init(), 100);
      return;
    }

    try {
      firebase.app();
      this.db = firebase.firestore();
      
      // Configurar cache offline para melhor performance
      this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        console.log('Persistence não habilitada:', err.code);
      });
      
      this.setupEventListeners();
      this.setupRealTimeListener(); // Usar listener em tempo real em vez de polling
      this.showMessage('Sistema carregado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao inicializar:', error);
      this.showMessage('Erro ao conectar com o banco de dados', 'error');
    }
  }

  setupEventListeners() {
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
      taskForm.addEventListener('submit', (e) => this.createTask(e));
    }

    const frequencySelect = document.getElementById('frequency');
    if (frequencySelect) {
      frequencySelect.addEventListener('change', this.toggleCustomFrequency);
    }
  }

  // Usar listener em tempo real em vez de polling para melhor performance
  setupRealTimeListener() {
    if (!this.db) return;
    
    this.db.collection('tasks')
      .orderBy('nextDue', 'asc')
      .limit(50)
      .onSnapshot((snapshot) => {
        this.renderTasks(snapshot);
      }, (error) => {
        console.error('Erro no listener em tempo real:', error);
        this.showTasksError();
      });
  }

  toggleCustomFrequency() {
    const customGroup = document.getElementById('customFrequencyGroup');
    const customDaysInput = document.getElementById('customDays');
    
    if (this.value === 'custom') {
      customGroup.style.display = 'block';
      customDaysInput.required = true;
    } else {
      customGroup.style.display = 'none';
      customDaysInput.required = false;
      customDaysInput.value = '';
    }
  }

  async createTask(e) {
    e.preventDefault();
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Criando...';
    submitButton.disabled = true;
    
    const formData = this.getFormData();
    if (!this.validateTaskData(formData)) {
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      return;
    }

    const newTask = this.buildTaskObject(formData);

    try {
      await this.db.collection('tasks').add(newTask);
      this.showMessage('Tarefa criada com sucesso!', 'success');
      this.resetForm();
    } catch (error) {
      console.error('Erro ao criar tarefa:', error);
      this.showMessage('Erro ao criar tarefa. Tente novamente.', 'error');
    } finally {
      submitButton.textContent = originalText;
      submitButton.disabled = false;
    }
  }

  getFormData() {
    return {
      taskName: document.getElementById('taskName').value.trim(),
      frequency: document.getElementById('frequency').value,
      customDays: document.getElementById('customDays').value,
      isRotating: document.getElementById('isRotating').checked
    };
  }

  validateTaskData(data) {
    if (!data.taskName) {
      this.showMessage('Nome da tarefa é obrigatório', 'error');
      return false;
    }

    if (data.frequency === 'custom' && (!data.customDays || data.customDays < 1)) {
      this.showMessage('Intervalo personalizado deve ser maior que 0', 'error');
      return false;
    }

    return true;
  }

  buildTaskObject(formData) {
    let intervalDays;
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

    return {
      name: formData.taskName,
      frequency: formData.frequency,
      intervalDays: intervalDays,
      isRotating: formData.isRotating,
      currentAssignee: this.users[0],
      assigneeIndex: 0,
      createdAt: firebase.firestore.Timestamp.now(),
      lastCompleted: null,
      nextDue: this.calculateNextDue(intervalDays),
      completed: false,
      completionHistory: []
    };
  }

  calculateNextDue(intervalDays) {
    const now = new Date();
    const nextDue = new Date(now.getTime() + (intervalDays * 24 * 60 * 60 * 1000));
    return firebase.firestore.Timestamp.fromDate(nextDue);
  }

  renderTasks(snapshot) {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();

    if (snapshot.empty) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'loading';
      emptyDiv.textContent = 'Nenhuma tarefa encontrada. Crie sua primeira tarefa!';
      fragment.appendChild(emptyDiv);
    } else {
      snapshot.forEach(doc => {
        const task = doc.data();
        const taskElement = this.createTaskElement(doc.id, task);
        fragment.appendChild(taskElement);
      });
    }

    // Atualizar de uma vez só para melhor performance
    taskList.innerHTML = '';
    taskList.appendChild(fragment);
  }

  createTaskElement(taskId, task) {
    const div = document.createElement('div');
    div.className = 'task-card fade-in';
    
    const now = new Date();
    const dueDate = task.nextDue.toDate();
    const isOverdue = dueDate < now && !task.completed;
    const isToday = this.isToday(dueDate);
    
    if (isOverdue) div.classList.add('overdue');
    if (task.completed) div.classList.add('completed');

    const frequencyText = this.getFrequencyText(task.frequency, task.intervalDays);
    const dueDateText = this.formatDate(dueDate);
    const dateClass = this.getDateClass(dueDate, isOverdue);
    
    div.innerHTML = `
      <div class="task-header">
        <div class="task-title">${this.escapeHtml(task.name)}</div>
        <div class="task-assigned">${task.currentAssignee}</div>
      </div>
      
      <div class="task-details">
        <p><strong>Frequência:</strong> ${frequencyText}</p>
        <p><strong>Próximo vencimento:</strong> <span class="${dateClass}">${dueDateText}</span></p>
        <p><strong>Rotativo:</strong> ${task.isRotating ? 'Sim' : 'Não'}</p>
        ${isOverdue ? '<p style="color: #f44336; font-weight: bold;">⚠️ ATRASADA!</p>' : ''}
        ${isToday ? '<p style="color: #2196F3; font-weight: bold;">📅 VENCE HOJE!</p>' : ''}
        ${task.completed ? '<p style="color: #4CAF50; font-weight: bold;">✅ CONCLUÍDA!</p>' : ''}
        ${task.isRotating && !task.completed ? `<div class="next-assignee-indicator">Próximo responsável: ${this.getNextAssignee(task)}</div>` : ''}
      </div>
      
      <div class="task-actions">
        ${!task.completed ? `<button class="btn btn-complete" onclick="taskManager.completeTask('${taskId}')">Marcar como Concluída</button>` : ''}
        <button class="btn btn-delete" onclick="taskManager.deleteTask('${taskId}')">Excluir Tarefa</button>
      </div>
    `;
    
    return div;
  }

  // Função para escapar HTML e prevenir XSS
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getNextAssignee(task) {
    if (!task.isRotating) return task.currentAssignee;
    const nextIndex = (task.assigneeIndex + 1) % this.users.length;
    return this.users[nextIndex];
  }

  getDateClass(dueDate, isOverdue) {
    if (isOverdue) return 'date-highlight date-overdue';
    if (this.isToday(dueDate)) return 'date-highlight date-today';
    return 'date-highlight date-future';
  }

  isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  getFrequencyText(frequency, intervalDays) {
    switch (frequency) {
      case 'daily':
        return 'Diária';
      case 'weekly':
        return 'Semanal';
      case 'custom':
        return `A cada ${intervalDays} dias`;
      default:
        return 'Não definida';
    }
  }

  formatDate(date) {
    const options = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('pt-BR', options);
  }

  async completeTask(taskId) {
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Processando...';
    button.disabled = true;

    try {
      const taskRef = this.db.collection('tasks').doc(taskId);
      const taskDoc = await taskRef.get();
      
      if (!taskDoc.exists) {
        this.showMessage('Tarefa não encontrada', 'error');
        return;
      }
      
      const task = taskDoc.data();
      const updates = this.calculateTaskCompletion(task);
      
      await taskRef.update(updates);
      this.showMessage(`Tarefa concluída! Próximo responsável: ${updates.currentAssignee}`, 'success');
    } catch (error) {
      console.error('Erro ao completar tarefa:', error);
      this.showMessage('Erro ao completar tarefa. Tente novamente.', 'error');
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  calculateTaskCompletion(task) {
    let newAssigneeIndex = task.assigneeIndex;
    let newAssignee = task.currentAssignee;
    
    if (task.isRotating) {
      newAssigneeIndex = (task.assigneeIndex + 1) % this.users.length;
      newAssignee = this.users[newAssigneeIndex];
    }
    
    const nextDue = this.calculateNextDue(task.intervalDays);
    
    const completionRecord = {
      completedBy: task.currentAssignee,
      completedAt: firebase.firestore.Timestamp.now()
    };
    
    const updatedHistory = task.completionHistory || [];
    updatedHistory.push(completionRecord);

    return {
      completed: false,
      lastCompleted: firebase.firestore.Timestamp.now(),
      nextDue: nextDue,
      currentAssignee: newAssignee,
      assigneeIndex: newAssigneeIndex,
      completionHistory: updatedHistory
    };
  }

  async deleteTask(taskId) {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) {
      return;
    }

    try {
      await this.db.collection('tasks').doc(taskId).delete();
      this.showMessage('Tarefa excluída com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error);
      this.showMessage('Erro ao excluir tarefa. Tente novamente.', 'error');
    }
  }

  showMessage(message, type = 'info') {
    // Remove mensagens antigas
    const existingMessages = document.querySelectorAll('.success-message, .error-message');
    existingMessages.forEach(msg => msg.remove());

    // Criar nova mensagem
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
    messageDiv.textContent = message;

    // Inserir no topo do conteúdo principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.insertBefore(messageDiv, mainContent.firstChild);

      // Remover após 4 segundos
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 4000);
    }
  }

  showTasksError() {
    const taskList = document.getElementById('taskList');
    if (taskList) {
      taskList.innerHTML = '<div class="loading">Erro ao carregar tarefas. Verifique sua conexão.</div>';
    }
  }

  resetForm() {
    const form = document.getElementById('taskForm');
    if (form) {
      form.reset();
      document.getElementById('customFrequencyGroup').style.display = 'none';
    }
  }
}

// Inicializar o gerenciador de tarefas
let taskManager;
document.addEventListener('DOMContentLoaded', function() {
  taskManager = new TaskManager();
});
