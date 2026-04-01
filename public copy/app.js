// Organizador de Tarefas Domésticas - JavaScript Principal

class TaskManager {
  constructor() {
    this.db = null;
    this.users = ['Tiago', 'Caio', 'Patinhas'];
    this.tasks = []; // Cache local das tarefas
    this.dataLoaded = false; // Flag para controlar carregamento único
    this.cacheKey = 'organizer_tasks_cache';
    this.cacheTimestampKey = 'organizer_cache_timestamp';
    this.cacheExpirationTime = 5 * 60 * 1000; // 5 minutos
    this._perf = {}; // armazenar marcas simples
    
    // Mostrar loading imediatamente
    this.showLoadingState();
    this.init();
    
    document.addEventListener('DOMContentLoaded', () => { this._perf.dcl = performance.now(); });
    window.addEventListener('load', () => { this._perf.load = performance.now(); });
  }

  async init() {
    // 1. Configurar listeners imediatamente
    this.setupEventListeners();
    
    // 2. Tentar carregar do cache primeiro
    if (this.loadFromCache()) {
      this.showMessage('Dados carregados do cache local', 'success');
    }

    // 3. Aguardar o Firebase estar disponível com timeout
    if (typeof firebase === 'undefined') {
      if (!this._firebaseRetries) this._firebaseRetries = 0;
      const maxRetries = 50; // 5 segundos no máximo
      
      if (this._firebaseRetries >= maxRetries) {
        console.error('Timeout: Firebase não carregou após 5 segundos');
        this.showMessage('Erro ao carregar Firebase. Usando apenas cache local.', 'error');
        this.updateSyncStatus('error', 'Erro de conexão');
        return;
      }
      
      this._firebaseRetries++;
      this.updateLoadingState(`Aguardando Firebase... (${this._firebaseRetries}/${maxRetries})`);
      setTimeout(() => this.init(), 100);
      return;
    }

    try {
      this.updateLoadingState('Conectando ao servidor...');
      this.updateSyncStatus('syncing', 'Sincronizando...');
      const startTime = performance.now();
      
      // 4. Inicializar Firebase e operações em paralelo
      firebase.app();
      this.db = firebase.firestore();
      
      // Fazer operações em paralelo para ganhar tempo
      const promises = [
        this.db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
          console.log('Persistence não habilitada:', err.code);
        }),
        this.loadTasksFromServer() // Carregar do servidor em paralelo
      ];

      await Promise.all(promises);
      
      const loadTime = performance.now() - startTime;
      console.log(`✅ Sistema inicializado em ${Math.round(loadTime)}ms`);
      this.showMessage('Sistema carregado com sucesso!', 'success');
      this.updateSyncStatus('success', 'Sincronizado');
      
      // Log de métricas de performance (apenas em desenvolvimento)
      setTimeout(() => this.logPerformanceMetrics(), 1000);
    } catch (error) {
      console.error('Erro ao inicializar:', error);
      this.showMessage('Erro ao conectar com o banco de dados. Usando cache local.', 'error');
      this.updateSyncStatus('error', 'Erro de conexão');
    }
  }  setupEventListeners() {
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
      taskForm.addEventListener('submit', (e) => this.createTask(e));
    }

    const frequencySelect = document.getElementById('frequency');
    if (frequencySelect) {
      frequencySelect.addEventListener('change', this.toggleCustomFrequency);
    }

    // Setup para o modal de edição
    const editModal = document.getElementById('editModal');
    if (editModal) {
      // Fechar modal ao clicar fora
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
          this.closeEditModal();
        }
      });
    }

    const editFrequencySelect = document.getElementById('editFrequency');
    if (editFrequencySelect) {
      editFrequencySelect.addEventListener('change', function() {
        const customGroup = document.getElementById('editCustomFrequencyGroup');
        const customDaysInput = document.getElementById('editCustomDays');
        
        if (this.value === 'custom') {
          customGroup.style.display = 'block';
          customDaysInput.required = true;
        } else {
          customGroup.style.display = 'none';
          customDaysInput.required = false;
          customDaysInput.value = '';
        }
      });
    }
  }

  // Carrega dados do servidor (com estratégia otimizada)
  async loadTasksFromServer() {
    if (!this.db || this.dataLoaded) return;
    
    try {
      this.updateLoadingState('Carregando tarefas...');
      const startTime = performance.now();
      
      // Carregar menos dados inicialmente para velocidade
      // Tentar cache local primeiro, depois servidor
      const snapshot = await this.db.collection('tasks')
        .limit(20) // Reduzido de 50 para 20 para carregar mais rápido
        .get({ source: 'default' }); // Tenta cache primeiro, depois servidor
      
      const loadTime = performance.now() - startTime;
      console.log(`⏱️ Tarefas carregadas em ${Math.round(loadTime)}ms`);
      
      const serverTasks = [];
      snapshot.forEach(doc => {
        serverTasks.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Se havia cache, fazer merge inteligente
      if (this.tasks.length > 0) {
        this.tasks = this.mergeTasksData(this.tasks, serverTasks);
      } else {
        this.tasks = serverTasks;
      }
      
      // Salvar no cache localStorage
      this.saveToCache(this.tasks);
      
      this.dataLoaded = true;
      this.renderTasksFromCache();
      
      // Carregar mais tarefas em background se necessário
      this.loadMoreTasksInBackground();
      
    } catch (error) {
      console.error('Erro ao carregar tarefas:', error);
      if (this.tasks.length === 0) {
        this.showTasksError();
      } else {
        this.showMessage('Usando dados do cache local', 'warning');
      }
    }
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

    // Gerar ID temporário para a nova tarefa
    const tempId = 'temp_' + Date.now();
    const taskWithId = { id: tempId, ...newTask };

    // 1. Atualizar interface imediatamente (Optimistic Update)
    this.tasks.push(taskWithId);
    this.saveToCache(this.tasks); // Salvar no cache imediatamente
    this.renderTasksFromCache();
    this.showMessage('Tarefa criada com sucesso!', 'success');
    this.resetForm();
    
    // 2. Salvar no servidor E AGUARDAR a sincronização
    await this.saveTaskToServer(newTask, tempId);
    
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }

  getFormData() {
    // Coletar participantes selecionados
    const selectedParticipants = [];
    document.querySelectorAll('.participant-checkbox:checked').forEach(checkbox => {
      selectedParticipants.push(checkbox.value);
    });
    
    return {
      taskName: document.getElementById('taskName').value.trim(),
      frequency: document.getElementById('frequency').value,
      customDays: document.getElementById('customDays').value,
      isRotating: true, // Sempre rotativo agora
      participants: selectedParticipants.length > 0 ? selectedParticipants : this.users // Todos por padrão
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

    if (!data.participants || data.participants.length === 0) {
      this.showMessage('Selecione pelo menos um participante', 'error');
      return false;
    }

    return true;
  }

  buildTaskObject(formData) {
    let intervalDays = null;
    let nextDue = null;
    
    // Só calcula intervalDays e nextDue se uma frequência foi especificada
    if (formData.frequency && formData.frequency !== 'none') {
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
      nextDue = this.calculateNextDue(intervalDays);
    }

    return {
      name: formData.taskName,
      frequency: formData.frequency || 'none',
      intervalDays: intervalDays,
      isRotating: true, // Sempre rotativo
      participants: formData.participants, // Lista de participantes
      currentAssignee: formData.participants[0], // Sempre começa com o primeiro da lista
      assigneeIndex: 0,
      createdAt: firebase.firestore.Timestamp.now(),
      lastCompleted: null,
      nextDue: nextDue,
      completed: false,
      completionHistory: []
    };
  }

  calculateNextDue(intervalDays) {
    // Criar data sem hora (apenas dia)
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextDue = new Date(today.getTime() + (intervalDays * 24 * 60 * 60 * 1000));
    return firebase.firestore.Timestamp.fromDate(nextDue);
  }



  // Renderiza tarefas do cache local (muito mais rápido)
  renderTasksFromCache() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();

    if (this.tasks.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'loading';
      emptyDiv.textContent = 'Nenhuma tarefa encontrada. Crie sua primeira tarefa!';
      fragment.appendChild(emptyDiv);
    } else {
      // Manter ordem de criação sem ordenar por data
      // Ordenar apenas por ID para manter ordem consistente
      const sortedTasks = this.tasks.sort((a, b) => {
        return (a.id || '').localeCompare(b.id || '');
      });

      sortedTasks.forEach(task => {
        const taskElement = this.createTaskElement(task.id, task);
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
    const dueDate = task.nextDue?.toDate ? task.nextDue.toDate() : (task.nextDue ? new Date(task.nextDue) : null);
    const isOverdue = dueDate && dueDate < now && !task.completed;
    const isToday = dueDate && this.isToday(dueDate);
    
    if (isOverdue) div.classList.add('overdue');
    if (task.completed) div.classList.add('completed');

    const frequencyText = this.getFrequencyText(task.frequency, task.intervalDays);
    const dueDateText = dueDate ? this.formatDate(dueDate) : 'Sem prazo definido';
    const dateClass = dueDate ? this.getDateClass(dueDate, isOverdue) : 'date-highlight';
    
    div.innerHTML = `
      <div class="task-header">
        <div class="task-title">${this.escapeHtml(task.name)}</div>
        <div class="task-assigned">${task.currentAssignee}</div>
      </div>
      
      <div class="task-details">
        <p><strong>Frequência:</strong> ${frequencyText}</p>
        <p><strong>Próximo vencimento:</strong> <span class="${dateClass}">${dueDateText}</span></p>
        <p><strong>Participantes:</strong> ${(task.participants || this.users).join(', ')}</p>
        ${isOverdue ? '<p style="color: #f44336; font-weight: bold;">⚠️ ATRASADA!</p>' : ''}
        ${isToday ? '<p style="color: #2196F3; font-weight: bold;">📅 VENCE HOJE!</p>' : ''}
        ${task.completed ? '<p style="color: #4CAF50; font-weight: bold;">✅ CONCLUÍDA!</p>' : ''}
        ${!task.completed ? `<div class="next-assignee-indicator">Próximo responsável: ${this.getNextAssignee(task)}</div>` : ''}
      </div>
      
      <div class="task-actions">
        ${!task.completed ? `<button class="btn btn-complete" onclick="taskManager.completeTask('${taskId}')">Marcar como Concluída</button>` : ''}
        <button class="btn btn-edit" onclick="taskManager.editTask('${taskId}')">Editar Tarefa</button>
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
    const taskParticipants = task.participants || this.users;
    const nextIndex = (task.assigneeIndex + 1) % taskParticipants.length;
    return taskParticipants[nextIndex];
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
      case 'none':
        return 'Sem prazo';
      default:
        return 'Não definida';
    }
  }

  formatDate(date) {
    const options = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric'
    };
    return date.toLocaleDateString('pt-BR', options);
  }

  async completeTask(taskId) {
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Processando...';
    button.disabled = true;

    // Encontrar tarefa no cache local
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      this.showMessage('Tarefa não encontrada', 'error');
      button.textContent = originalText;
      button.disabled = false;
      return;
    }

    const task = this.tasks[taskIndex];
    
    console.log('📝 Tarefa ANTES da conclusão:', {
      id: task.id,
      name: task.name,
      nextDue: task.nextDue?.toDate ? task.nextDue.toDate().toLocaleDateString('pt-BR') : task.nextDue,
      currentAssignee: task.currentAssignee
    });
    
    const updates = this.calculateTaskCompletion(task);
    
    console.log('✅ Atualizações calculadas:', {
      nextDue: updates.nextDue?.toDate ? updates.nextDue.toDate().toLocaleDateString('pt-BR') : updates.nextDue,
      currentAssignee: updates.currentAssignee
    });
    
    // 1. Atualizar interface imediatamente (Optimistic Update)
    this.tasks[taskIndex] = { ...task, ...updates };
    this.saveToCache(this.tasks); // Salvar no cache imediatamente
    this.renderTasksFromCache();
    this.showMessage(`Tarefa concluída! Próximo responsável: ${updates.currentAssignee}`, 'success');
    
    // 2. Salvar no servidor em background
    await this.updateTaskOnServer(taskId, updates);
    
    button.textContent = originalText;
    button.disabled = false;
  }

  calculateTaskCompletion(task) {
    // Usar lista de participantes da tarefa ou todos os usuários como fallback
    const taskParticipants = task.participants || this.users;
    
    // Calcular próximo responsável (sempre rotativo agora)
    let newAssigneeIndex = (task.assigneeIndex + 1) % taskParticipants.length;
    let newAssignee = taskParticipants[newAssigneeIndex];
    
    // Calcular próxima data de vencimento (apenas se a tarefa tiver prazo)
    let nextDue = null;
    
    if (task.frequency && task.frequency !== 'none' && task.intervalDays) {
      const currentDueDate = task.nextDue?.toDate ? task.nextDue.toDate() : new Date(task.nextDue);
      const now = new Date();
      
      // Normalizar as datas para comparação (sem hora)
      const currentDueDateOnly = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth(), currentDueDate.getDate());
      const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Se a tarefa está atrasada, calcular a partir de hoje
      // Senão, calcular a partir da data de vencimento original
      let baseDate;
      if (currentDueDateOnly.getTime() < todayOnly.getTime()) {
        // Tarefa atrasada: próximo vencimento começa a partir de hoje
        baseDate = todayOnly;
      } else {
        // Tarefa no prazo ou vence hoje: mantém a periodicidade original
        baseDate = currentDueDateOnly;
      }
      
      // Adicionar o intervalo de dias
      const nextDueDate = new Date(baseDate.getTime() + (task.intervalDays * 24 * 60 * 60 * 1000));
      nextDue = firebase.firestore.Timestamp.fromDate(nextDueDate);
    }
    
    // Adicionar ao histórico de conclusão
    const completionRecord = {
      completedBy: task.currentAssignee,
      completedAt: firebase.firestore.Timestamp.now()
    };
    
    const updatedHistory = task.completionHistory || [];
    updatedHistory.push(completionRecord);

    return {
      completed: false, // Reset para false para a próxima iteração
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

    // 1. Atualizar interface imediatamente (Optimistic Update)
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      this.tasks.splice(taskIndex, 1);
      this.saveToCache(this.tasks); // Salvar no cache imediatamente
      this.renderTasksFromCache();
      this.showMessage('Tarefa excluída com sucesso!', 'success');
    }

    // 2. Excluir do servidor em background
    this.deleteTaskFromServer(taskId);
  }

  async editTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) {
      this.showMessage('Tarefa não encontrada', 'error');
      return;
    }

    // Preencher o formulário de edição
    document.getElementById('editTaskName').value = task.name;
    document.getElementById('editFrequency').value = task.frequency || 'none';
    document.getElementById('editCurrentAssignee').value = task.currentAssignee;
    
    // Calcular e mostrar próximo prazo
    if (task.nextDue) {
      const dueDate = task.nextDue?.toDate ? task.nextDue.toDate() : new Date(task.nextDue);
      const dateStr = dueDate.toISOString().split('T')[0];
      document.getElementById('editNextDue').value = dateStr;
    } else {
      document.getElementById('editNextDue').value = '';
    }
    
    // Mostrar/ocultar campo customizado
    if (task.frequency === 'custom') {
      document.getElementById('editCustomFrequencyGroup').style.display = 'block';
      document.getElementById('editCustomDays').value = task.intervalDays || '';
    } else {
      document.getElementById('editCustomFrequencyGroup').style.display = 'none';
    }

    // Preencher lista de participantes ordenáveis
    this.renderEditParticipantsList(task.participants || this.users);

    // Mostrar modal
    document.getElementById('editModal').style.display = 'flex';
    
    // Armazenar ID da tarefa sendo editada
    document.getElementById('editModal').dataset.editingTaskId = taskId;
  }

  renderEditParticipantsList(participants) {
    const container = document.getElementById('editParticipantsList');
    container.innerHTML = '';
    
    participants.forEach((participant, index) => {
      const div = document.createElement('div');
      div.className = 'participant-item';
      div.draggable = true;
      div.dataset.index = index;
      div.innerHTML = `
        <span class="drag-handle">☰</span>
        <span class="participant-name">${participant}</span>
        <button type="button" class="btn-remove-participant" onclick="taskManager.removeEditParticipant(${index})">✕</button>
      `;
      
      // Eventos de drag and drop
      div.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', div.innerHTML);
        div.classList.add('dragging');
        e.dataTransfer.setData('dragIndex', index);
      });
      
      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
      });
      
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = container.querySelector('.dragging');
        const afterElement = this.getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
          container.appendChild(dragging);
        } else {
          container.insertBefore(dragging, afterElement);
        }
      });
      
      container.appendChild(div);
    });
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.participant-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  removeEditParticipant(index) {
    const container = document.getElementById('editParticipantsList');
    const items = container.querySelectorAll('.participant-item');
    if (items.length <= 1) {
      this.showMessage('Deve haver pelo menos um participante', 'error');
      return;
    }
    items[index].remove();
    
    // Renumerar índices
    const remainingItems = container.querySelectorAll('.participant-item');
    remainingItems.forEach((item, newIndex) => {
      item.dataset.index = newIndex;
      const removeBtn = item.querySelector('.btn-remove-participant');
      removeBtn.onclick = () => this.removeEditParticipant(newIndex);
    });
  }

  addEditParticipant() {
    const select = document.getElementById('editAddParticipant');
    const selectedUser = select.value;
    
    if (!selectedUser) return;
    
    const container = document.getElementById('editParticipantsList');
    const existingParticipants = Array.from(container.querySelectorAll('.participant-name'))
      .map(el => el.textContent);
    
    if (existingParticipants.includes(selectedUser)) {
      this.showMessage('Este participante já está na lista', 'warning');
      return;
    }
    
    const currentParticipants = existingParticipants;
    currentParticipants.push(selectedUser);
    this.renderEditParticipantsList(currentParticipants);
    
    // Reset select
    select.value = '';
  }

  closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    document.getElementById('editTaskForm').reset();
    delete document.getElementById('editModal').dataset.editingTaskId;
  }

  async saveEditTask(e) {
    e.preventDefault();
    
    const modal = document.getElementById('editModal');
    const taskId = modal.dataset.editingTaskId;
    
    if (!taskId) {
      this.showMessage('Erro: ID da tarefa não encontrado', 'error');
      return;
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Salvando...';
    submitButton.disabled = true;
    
    // Coletar dados do formulário de edição
    const taskName = document.getElementById('editTaskName').value.trim();
    const frequency = document.getElementById('editFrequency').value;
    const customDays = document.getElementById('editCustomDays').value;
    const currentAssignee = document.getElementById('editCurrentAssignee').value;
    const nextDueValue = document.getElementById('editNextDue').value;
    
    // Coletar participantes da lista ordenável
    const participantItems = document.querySelectorAll('#editParticipantsList .participant-name');
    const participants = Array.from(participantItems).map(el => el.textContent);
    
    // Validação
    if (!taskName) {
      this.showMessage('Nome da tarefa é obrigatório', 'error');
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      return;
    }

    if (frequency === 'custom' && (!customDays || customDays < 1)) {
      this.showMessage('Intervalo personalizado deve ser maior que 0', 'error');
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      return;
    }

    if (participants.length === 0) {
      this.showMessage('Deve haver pelo menos um participante', 'error');
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      return;
    }

    // Encontrar a tarefa no cache
    const taskIndex = this.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      this.showMessage('Tarefa não encontrada', 'error');
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      return;
    }

    const currentTask = this.tasks[taskIndex];

    // Calcular novos valores
    let intervalDays = null;
    let nextDue = null;
    
    // Se tem data manual definida, usar ela
    if (nextDueValue) {
      const dueDate = new Date(nextDueValue + 'T00:00:00');
      nextDue = firebase.firestore.Timestamp.fromDate(dueDate);
    } else if (frequency && frequency !== 'none') {
      // Senão, calcular baseado na frequência
      switch (frequency) {
        case 'daily':
          intervalDays = 1;
          break;
        case 'weekly':
          intervalDays = 7;
          break;
        case 'custom':
          intervalDays = parseInt(customDays);
          break;
      }
      nextDue = this.calculateNextDue(intervalDays);
    }

    // Atualizar índice do responsável atual baseado na nova ordem de participantes
    const newAssigneeIndex = participants.indexOf(currentAssignee);

    const updates = {
      name: taskName,
      frequency: frequency || 'none',
      intervalDays: intervalDays,
      participants: participants,
      nextDue: nextDue,
      currentAssignee: currentAssignee,
      assigneeIndex: newAssigneeIndex >= 0 ? newAssigneeIndex : 0
    };

    // 1. Atualizar interface imediatamente (Optimistic Update)
    this.tasks[taskIndex] = { ...currentTask, ...updates };
    this.saveToCache(this.tasks);
    this.renderTasksFromCache();
    this.showMessage('Tarefa atualizada com sucesso!', 'success');
    
    // 2. Salvar no servidor em background
    await this.updateTaskOnServer(taskId, updates);
    
    // 3. Fechar modal
    this.closeEditModal();
    
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }

  showMessage(message, type = 'info') {
    // Remove mensagens antigas
    const existingMessages = document.querySelectorAll('.success-message, .error-message, .warning-message');
    existingMessages.forEach(msg => msg.remove());

    // Criar nova mensagem
    const messageDiv = document.createElement('div');
    messageDiv.className = type === 'success' ? 'success-message' : 
                         type === 'warning' ? 'warning-message' : 'error-message';
    messageDiv.textContent = message;

    // Inserir no topo do conteúdo principal
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.insertBefore(messageDiv, mainContent.firstChild);

      // Remover após 5 segundos
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 5000);
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

  // Métodos para salvar no servidor em background (sem bloquear interface)
  async saveTaskToServer(newTask, tempId) {
    try {
      console.log('💾 Salvando nova tarefa no servidor...', newTask);
      this.updateSyncStatus('syncing', 'Salvando...');
      
      const docRef = await this.db.collection('tasks').add(newTask);
      console.log('✅ Tarefa salva no servidor com ID:', docRef.id);
      
      // Atualizar ID temporário com ID real do servidor
      const taskIndex = this.tasks.findIndex(t => t.id === tempId);
      if (taskIndex !== -1) {
        this.tasks[taskIndex].id = docRef.id;
        // Atualizar cache com ID real
        this.saveToCache(this.tasks);
        console.log('🔄 ID temporário atualizado para ID real:', docRef.id);
      }
      
      this.updateSyncStatus('success', 'Sincronizado');
      
      // Forçar sincronização após salvar
      setTimeout(() => {
        console.log('🔃 Sincronizando dados após criação...');
        this.forceSyncWithServer();
      }, 500);
      
    } catch (error) {
      console.error('❌ Erro ao salvar tarefa no servidor:', error);
      this.updateSyncStatus('error', 'Erro ao salvar');
      // Em caso de erro, poderia remover da interface ou tentar novamente
      this.showMessage('Erro ao sincronizar com servidor, mas tarefa foi criada localmente', 'warning');
    }
  }

  async updateTaskOnServer(taskId, updates) {
    try {
      if (taskId.startsWith('temp_')) {
        console.log('⏳ Tarefa temporária, aguardando sincronização...');
        return;
      }
      
      console.log('🔄 Salvando no servidor:', taskId, updates);
      this.updateSyncStatus('syncing', 'Atualizando...');
      
      await this.db.collection('tasks').doc(taskId).update(updates);
      console.log('✅ Tarefa atualizada no servidor com sucesso:', taskId);
      
      this.updateSyncStatus('success', 'Sincronizado');
      
      // Após salvar no servidor, forçar reload dos dados para sincronizar
      setTimeout(() => {
        console.log('🔃 Recarregando dados do servidor...');
        this.forceSyncWithServer();
      }, 500);
      
    } catch (error) {
      console.error('❌ Erro ao atualizar tarefa no servidor:', error);
      this.updateSyncStatus('error', 'Erro ao atualizar');
      this.showMessage('Erro ao sincronizar com servidor, mas alteração foi feita localmente', 'warning');
    }
  }

  async deleteTaskFromServer(taskId) {
    try {
      if (taskId.startsWith('temp_')) {
        console.log('Tarefa temporária excluída antes da sincronização');
        return;
      }
      
      this.updateSyncStatus('syncing', 'Excluindo...');
      await this.db.collection('tasks').doc(taskId).delete();
      console.log('Tarefa excluída do servidor:', taskId);
      this.updateSyncStatus('success', 'Sincronizado');
    } catch (error) {
      console.error('Erro ao excluir tarefa do servidor:', error);
      this.updateSyncStatus('error', 'Erro ao excluir');
      this.showMessage('Erro ao sincronizar com servidor, mas tarefa foi excluída localmente', 'warning');
    }
  }

  // Método opcional para forçar sincronização manual
  async forceSyncWithServer() {
    if (!this.db) return;
    
    this.updateSyncStatus('syncing', 'Sincronizando...');
    this.showMessage('Sincronizando dados...', 'info');
    
    try {
      const snapshot = await this.db.collection('tasks')
        .limit(50)
        .get();
      
      this.tasks = [];
      snapshot.forEach(doc => {
        this.tasks.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      this.renderTasksFromCache();
      this.showMessage('Dados sincronizados com sucesso!', 'success');
      this.updateSyncStatus('success', 'Sincronizado');
      
      // Carregar dados adicionais em background se necessário
      this.loadMoreTasksInBackground();
      
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
      this.showMessage('Erro na sincronização. Usando dados locais.', 'warning');
      this.updateSyncStatus('error', 'Erro de conexão');
    }
  }

  // === SYNC STATUS INDICATOR ===
  updateSyncStatus(status = 'success', message = 'Sincronizado') {
    const syncStatus = document.getElementById('syncStatus');
    if (!syncStatus) return;
    
    // Remove classes anteriores
    syncStatus.className = 'sync-status';
    
    // Adiciona nova classe
    if (status !== 'success') {
      syncStatus.classList.add(status);
    }
    
    // Atualiza texto
    const syncText = syncStatus.querySelector('.sync-text');
    if (syncText) {
      syncText.textContent = message;
    }
  }

  // === MÉTODOS DE CACHE E LOADING STATE ===
  
  showLoadingState() {
    const taskList = document.getElementById('taskList');
    if (taskList) {
      taskList.innerHTML = `
        <div class="loading-container">
          <div class="loading-spinner"></div>
          <div class="loading-message">Inicializando sistema...</div>
          <div class="skeleton-tasks">
            ${this.createSkeletonTask()}
            ${this.createSkeletonTask()}
            ${this.createSkeletonTask()}
          </div>
        </div>
      `;
    }
  }

  updateLoadingState(message) {
    const loadingMessage = document.querySelector('.loading-message');
    if (loadingMessage) {
      loadingMessage.textContent = message;
    }
  }

  createSkeletonTask() {
    return `
      <div class="skeleton-task-card">
        <div class="skeleton-header">
          <div class="skeleton-title"></div>
          <div class="skeleton-assignee"></div>
        </div>
        <div class="skeleton-details">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
        </div>
        <div class="skeleton-actions">
          <div class="skeleton-button"></div>
          <div class="skeleton-button"></div>
        </div>
      </div>
    `;
  }

  // Cache localStorage
  saveToCache(tasks) {
    try {
      const cacheData = {
        tasks: tasks.map(task => ({
          ...task,
          // Converter Firestore Timestamps para strings para serialização
          createdAt: task.createdAt?.toDate ? task.createdAt.toDate().toISOString() : task.createdAt,
          nextDue: task.nextDue?.toDate ? task.nextDue.toDate().toISOString() : task.nextDue,
          lastCompleted: task.lastCompleted?.toDate ? task.lastCompleted.toDate().toISOString() : task.lastCompleted,
          completionHistory: task.completionHistory?.map(completion => ({
            ...completion,
            completedAt: completion.completedAt?.toDate ? completion.completedAt.toDate().toISOString() : completion.completedAt
          })) || []
        }))
      };
      
      localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
      localStorage.setItem(this.cacheTimestampKey, Date.now().toString());
      console.log('Dados salvos no cache local');
    } catch (error) {
      console.warn('Erro ao salvar cache:', error);
    }
  }

  loadFromCache() {
    try {
      const cacheTimestamp = localStorage.getItem(this.cacheTimestampKey);
      const cacheData = localStorage.getItem(this.cacheKey);
      
      if (!cacheData || !cacheTimestamp) return false;
      
      const cacheAge = Date.now() - parseInt(cacheTimestamp);
      if (cacheAge > this.cacheExpirationTime) {
        console.log('Cache expirado, removendo...');
        this.clearCache();
        return false;
      }
      
      const parsedData = JSON.parse(cacheData);
      
      // Converter strings de volta para Dates
      this.tasks = parsedData.tasks.map(task => ({
        ...task,
        createdAt: task.createdAt ? new Date(task.createdAt) : null,
        nextDue: task.nextDue ? new Date(task.nextDue) : null,
        lastCompleted: task.lastCompleted ? new Date(task.lastCompleted) : null,
        completionHistory: task.completionHistory?.map(completion => ({
          ...completion,
          completedAt: completion.completedAt ? new Date(completion.completedAt) : null
        })) || []
      }));
      
      if (this.tasks.length > 0) {
        this.renderTasksFromCache();
        console.log(`Carregado ${this.tasks.length} tarefas do cache`);
        return true;
      }
      
    } catch (error) {
      console.warn('Erro ao carregar cache:', error);
      this.clearCache();
    }
    
    return false;
  }

  clearCache() {
    localStorage.removeItem(this.cacheKey);
    localStorage.removeItem(this.cacheTimestampKey);
  }

  mergeTasksData(cachedTasks, serverTasks) {
    const mergedTasks = [...serverTasks];
    
    // Adicionar tarefas que existem no cache mas não no servidor (ex: temporárias)
    cachedTasks.forEach(cachedTask => {
      if (!serverTasks.find(serverTask => serverTask.id === cachedTask.id)) {
        mergedTasks.push(cachedTask);
      }
    });
    
    return mergedTasks;
  }
  // === LAZY LOADING E OTIMIZAÇÕES AVANÇADAS ===
  
  async loadMoreTasksInBackground() {
    if (!this.db || this.tasks.length >= 50) return;
    
    try {
      // Carregar tarefas adicionais em background
      const snapshot = await this.db.collection('tasks')
        .limit(50)
        .offset(this.tasks.length)
        .get();
      
      if (!snapshot.empty) {
        const additionalTasks = [];
        snapshot.forEach(doc => {
          additionalTasks.push({
            id: doc.id,
            ...doc.data()
          });
        });
        
        this.tasks.push(...additionalTasks);
        this.saveToCache(this.tasks);
        
        console.log(`Carregadas ${additionalTasks.length} tarefas adicionais em background`);
      }
      
    } catch (error) {
      console.warn('Erro ao carregar tarefas adicionais:', error);
    }
  }

  // Preload crítico - otimizar timestamps
  optimizeTaskTimestamps(task) {
    // Cache das conversões de timestamp para evitar reprocessamento
    if (!task._optimized) {
      if (task.nextDue?.toDate) {
        task._nextDueCache = task.nextDue.toDate();
      } else if (typeof task.nextDue === 'string') {
        task._nextDueCache = new Date(task.nextDue);
      }
      
      if (task.createdAt?.toDate) {
        task._createdAtCache = task.createdAt.toDate();
      } else if (typeof task.createdAt === 'string') {
        task._createdAtCache = new Date(task.createdAt);
      }
      
      task._optimized = true;
    }
    
    return task;
  }

  // Renderização otimizada com virtual scrolling básico
  renderTasksFromCacheOptimized() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    // Se não há tarefas, mostrar empty state
    if (this.tasks.length === 0) {
      taskList.innerHTML = '<div class="loading">Nenhuma tarefa encontrada. Crie sua primeira tarefa!</div>';
      return;
    }

    // Otimizar timestamps uma vez
    const optimizedTasks = this.tasks.map(task => this.optimizeTaskTimestamps(task));
    
    // Manter ordem de criação sem ordenar por data
    // Ordenar apenas por ID para manter ordem consistente
    const sortedTasks = optimizedTasks.sort((a, b) => {
      return (a.id || '').localeCompare(b.id || '');
    });

    // Renderizar apenas tarefas visíveis (implementação básica)
    const maxVisible = 20; // Máximo de tarefas visíveis inicialmente
    const tasksToRender = sortedTasks.slice(0, maxVisible);
    
    const fragment = document.createDocumentFragment();
    
    tasksToRender.forEach(task => {
      const taskElement = this.createTaskElementOptimized(task.id, task);
      fragment.appendChild(taskElement);
    });
    
    // Adicionar botão "Carregar mais" se necessário
    if (sortedTasks.length > maxVisible) {
      const loadMoreBtn = this.createLoadMoreButton(sortedTasks.length - maxVisible);
      fragment.appendChild(loadMoreBtn);
    }

    taskList.innerHTML = '';
    taskList.appendChild(fragment);
    
    // Adicionar classe para animação
    taskList.classList.add('content-loaded');
  }

  createLoadMoreButton(remainingCount) {
    const div = document.createElement('div');
    div.className = 'load-more-container';
    div.innerHTML = `
      <button class="btn btn-secondary load-more-btn" onclick="taskManager.loadMoreTasks()">
        Carregar mais ${remainingCount} tarefas
      </button>
    `;
    return div;
  }

  loadMoreTasks() {
    // Simplesmente re-renderizar com limite maior
    const taskList = document.getElementById('taskList');
    const currentVisible = taskList.querySelectorAll('.task-card').length;
    const newLimit = currentVisible + 10;
    
    this.renderTasksFromCacheWithLimit(newLimit);
  }

  renderTasksFromCacheWithLimit(limit) {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    const optimizedTasks = this.tasks.map(task => this.optimizeTaskTimestamps(task));
    
    // Manter ordem de criação sem ordenar por data
    // Ordenar apenas por ID para manter ordem consistente
    const sortedTasks = optimizedTasks.sort((a, b) => {
      return (a.id || '').localeCompare(b.id || '');
    });

    const tasksToRender = sortedTasks.slice(0, limit);
    const fragment = document.createDocumentFragment();
    
    tasksToRender.forEach(task => {
      const taskElement = this.createTaskElementOptimized(task.id, task);
      fragment.appendChild(taskElement);
    });
    
    if (sortedTasks.length > limit) {
      const loadMoreBtn = this.createLoadMoreButton(sortedTasks.length - limit);
      fragment.appendChild(loadMoreBtn);
    }

    taskList.innerHTML = '';
    taskList.appendChild(fragment);
  }

  createTaskElementOptimized(taskId, task) {
    const div = document.createElement('div');
    div.className = 'task-card fade-in';
    
    const now = new Date();
    const dueDate = task._nextDueCache || (task.nextDue ? new Date(task.nextDue) : null);
    const isOverdue = dueDate && dueDate < now && !task.completed;
    const isToday = dueDate && this.isToday(dueDate);
    
    if (isOverdue) div.classList.add('overdue');
    if (task.completed) div.classList.add('completed');

    const frequencyText = this.getFrequencyText(task.frequency, task.intervalDays);
    const dueDateText = dueDate ? this.formatDate(dueDate) : 'Sem prazo definido';
    const dateClass = dueDate ? this.getDateClass(dueDate, isOverdue) : 'date-highlight';
    
    div.innerHTML = `
      <div class="task-header">
        <div class="task-title">${this.escapeHtml(task.name)}</div>
        <div class="task-assigned">${task.currentAssignee}</div>
      </div>
      
      <div class="task-details">
        <p><strong>Frequência:</strong> ${frequencyText}</p>
        <p><strong>Próximo vencimento:</strong> <span class="${dateClass}">${dueDateText}</span></p>
        <p><strong>Participantes:</strong> ${(task.participants || this.users).join(', ')}</p>
        ${isOverdue ? '<p style="color: #f44336; font-weight: bold;">⚠️ ATRASADA!</p>' : ''}
        ${isToday ? '<p style="color: #2196F3; font-weight: bold;">📅 VENCE HOJE!</p>' : ''}
        ${task.completed ? '<p style="color: #4CAF50; font-weight: bold;">✅ CONCLUÍDA!</p>' : ''}
        ${!task.completed ? `<div class="next-assignee-indicator">Próximo responsável: ${this.getNextAssignee(task)}</div>` : ''}
      </div>
      
      <div class="task-actions">
        ${!task.completed ? `<button class="btn btn-complete" onclick="taskManager.completeTask('${taskId}')">Marcar como Concluída</button>` : ''}
        <button class="btn btn-edit" onclick="taskManager.editTask('${taskId}')">Editar Tarefa</button>
        <button class="btn btn-delete" onclick="taskManager.deleteTask('${taskId}')">Excluir Tarefa</button>
      </div>
    `;
    
    return div;
  }

  // Usar renderização otimizada por padrão
  renderTasksFromCache() {
    this.renderTasksFromCacheOptimized();
  }

  // === SISTEMA DE SINCRONIZAÇÃO INTELIGENTE ===
  
  showSyncIndicator(message, type = 'success') {
    const indicator = document.getElementById('sync-indicator') || this.createSyncIndicator();
    indicator.textContent = message;
    indicator.className = `sync-indicator ${type} show`;
    
    setTimeout(() => {
      indicator.classList.remove('show');
    }, 3000);
  }

  createSyncIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'sync-indicator';
    indicator.className = 'sync-indicator';
    document.body.appendChild(indicator);
    return indicator;
  }

  // === DEBUG E MÉTRICAS DE PERFORMANCE ===
  
  logPerformanceMetrics() {
    try {
      // Preferir marcas capturadas diretamente (elimina NaN em ambientes parciais)
      const dclMs = Number.isFinite(this._perf.dcl) ? Math.round(this._perf.dcl) : undefined;
      const loadMs = Number.isFinite(this._perf.load) ? Math.round(this._perf.load) : undefined;

      // Fallback: Navigation Timing L2
      if ((!dclMs || !loadMs) && performance.getEntriesByType) {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) {
          const base = nav.startTime || 0; // normalmente 0
          if (!dclMs && Number.isFinite(nav.domContentLoadedEventEnd)) {
            const val = nav.domContentLoadedEventEnd - base;
            if (val >= 0) this._perf.dcl = val;
          }
          if (!loadMs && Number.isFinite(nav.loadEventEnd)) {
            const val = nav.loadEventEnd - base;
            if (val >= 0) this._perf.load = val;
          }
        }
      }

      // Segundo fallback legado
      if ((!this._perf.dcl || !this._perf.load) && performance.timing) {
        const t = performance.timing;
        if (!this._perf.dcl && t.domContentLoadedEventEnd && t.navigationStart) {
          this._perf.dcl = t.domContentLoadedEventEnd - t.navigationStart;
        }
        if (!this._perf.load && t.loadEventEnd && t.navigationStart) {
          this._perf.load = t.loadEventEnd - t.navigationStart;
        }
      }

      const paints = performance.getEntriesByType?.('paint') || [];

      console.group('📊 Métricas de Performance');
      console.log('🚀 DOM Content Loaded:', Number.isFinite(this._perf.dcl) ? Math.round(this._perf.dcl) + 'ms' : 'indisponível');
      console.log('✅ Load Complete:', Number.isFinite(this._perf.load) ? Math.round(this._perf.load) + 'ms' : 'indisponível');
      paints.forEach(p => console.log(`🎨 ${p.name}:`, Math.round(p.startTime) + 'ms'));
      console.log('💾 Cache Status:', this.tasks.length > 0 ? 'HIT' : 'MISS');
      console.log('📦 Tasks Loaded:', this.tasks.length);
      console.groupEnd();
    } catch (e) {
      console.warn('Não foi possível coletar métricas:', e);
    }
  }

  // Método para forçar limpeza de cache (debug)
  clearAllCaches() {
    this.clearCache();
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          caches.delete(name);
        });
      });
    }
    console.log('🧹 Todos os caches limpos');
  }

  // Método para mostrar estatísticas do cache
  showCacheStats() {
    const cacheTimestamp = localStorage.getItem(this.cacheTimestampKey);
    const cacheData = localStorage.getItem(this.cacheKey);
    
    if (cacheData && cacheTimestamp) {
      const cacheAge = Date.now() - parseInt(cacheTimestamp);
      const cacheSize = new Blob([cacheData]).size;
      
      console.group('💾 Estatísticas do Cache');
      console.log('📅 Idade do cache:', Math.round(cacheAge / 1000) + 's');
      console.log('📏 Tamanho do cache:', Math.round(cacheSize / 1024) + 'KB');
      console.log('📊 Tarefas em cache:', JSON.parse(cacheData).tasks.length);
      console.log('⏰ Expira em:', Math.round((this.cacheExpirationTime - cacheAge) / 1000) + 's');
      console.groupEnd();
    } else {
      console.log('❌ Nenhum cache encontrado');
    }
  }

  // === DEMONSTRAÇÃO DE MÉTRICAS (ADICIONAL) ===
  
  runFullPerformanceTest() {
    console.group('🏁 TESTE COMPLETO DE PERFORMANCE');
    
    // 1. Métricas básicas
    this.logPerformanceMetrics();
    
    // 2. Cache stats
    this.showCacheStats();
    
    // 3. Testar velocidade de renderização
    const startRender = performance.now();
    this.renderTasksFromCache();
    const renderTime = performance.now() - startRender;
    console.log('⚡ Tempo de renderização:', Math.round(renderTime) + 'ms');
    
    // 4. Informações do sistema
    console.log('🌐 User Agent:', navigator.userAgent.split(' ').pop());
    console.log('💾 LocalStorage disponível:', 'localStorage' in window);
    console.log('👷 Service Worker:', 'serviceWorker' in navigator);
    console.log('📱 Conexão:', navigator.connection?.effectiveType || 'Desconhecido');
    
    // 5. Memory usage (se disponível)
    if (performance.memory) {
      console.log('🧠 Memória usada:', Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB');
    }
    
    console.groupEnd();
  }

  // Testar optimistic updates
  testOptimisticUpdates() {
    console.group('⚡ TESTE DE OPTIMISTIC UPDATES');
    
    const originalTasks = this.tasks.length;
    console.log('📊 Tarefas antes:', originalTasks);
    
    // Simular criação de tarefa
    const testTask = {
      id: 'test_' + Date.now(),
      name: 'Teste de Performance',
      currentAssignee: 'Tiago',
      frequency: 'daily',
      intervalDays: 1,
      nextDue: new Date(),
      isRotating: false,
      completed: false
    };
    
    const start = performance.now();
    this.tasks.push(testTask);
    this.renderTasksFromCache();
    const updateTime = performance.now() - start;
    
    console.log('⏱️ Tempo de update otimista:', Math.round(updateTime) + 'ms');
    console.log('📊 Tarefas depois:', this.tasks.length);
    
    // Remover tarefa de teste
    this.tasks.pop();
    this.renderTasksFromCache();
    
    console.log('✅ Teste concluído');
    console.groupEnd();
  }

  // Benchmark de diferentes métodos
  benchmarkMethods() {
    console.group('📊 BENCHMARK DE MÉTODOS');
    
    const iterations = 100;
    
    // Testar ordenação
    console.time('Ordenação de tarefas');
    for (let i = 0; i < iterations; i++) {
      // Manter ordem de criação sem ordenar por data
      this.tasks.sort((a, b) => {
        return (a.id || '').localeCompare(b.id || '');
      });
    }
    console.timeEnd('Ordenação de tarefas');
    
    // Testar cache de timestamps
    console.time('Cache de timestamps');
    for (let i = 0; i < iterations; i++) {
      this.tasks.forEach(task => this.optimizeTaskTimestamps(task));
    }
    console.timeEnd('Cache de timestamps');
    
    // Testar escape HTML
    console.time('Escape HTML');
    for (let i = 0; i < iterations; i++) {
      this.tasks.forEach(task => this.escapeHtml(task.name || 'Teste'));
    }
    console.timeEnd('Escape HTML');
    
    console.groupEnd();
  }

}

// Inicializar o gerenciador de tarefas
let taskManager;
document.addEventListener('DOMContentLoaded', function() {
  taskManager = new TaskManager();
  
  // Funções de debug globais (apenas desenvolvimento)
  window.debugOrganizer = {
    // Métricas básicas
    metrics: () => taskManager.logPerformanceMetrics(),
    showStats: () => taskManager.showCacheStats(),
    
    // Cache management
    clearCache: () => taskManager.clearAllCaches(),
    forceSync: () => taskManager.forceSyncWithServer(),
    
    // Testes avançados
    fullTest: () => taskManager.runFullPerformanceTest(),
    testOptimistic: () => taskManager.testOptimisticUpdates(),
    benchmark: () => taskManager.benchmarkMethods(),
    
    // Utilitários
    help: () => {
      console.group('🛠️ DEBUG ORGANIZER - COMANDOS DISPONÍVEIS');
      console.log('📊 debugOrganizer.metrics() - Ver métricas de performance');
      console.log('💾 debugOrganizer.showStats() - Ver estatísticas do cache');
      console.log('🧹 debugOrganizer.clearCache() - Limpar todos os caches');
      console.log('🔄 debugOrganizer.forceSync() - Forçar sincronização');
      console.log('🏁 debugOrganizer.fullTest() - Teste completo de performance');
      console.log('⚡ debugOrganizer.testOptimistic() - Testar optimistic updates');
      console.log('📊 debugOrganizer.benchmark() - Benchmark de métodos');
      console.groupEnd();
    }
  };
  
  // Mostrar help automaticamente
  console.log('🛠️ Debug tools carregados! Digite "debugOrganizer.help()" para ver comandos');
  
});
