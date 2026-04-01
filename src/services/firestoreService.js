import {
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  limit,
} from "firebase/firestore";
import { db } from "../config/firebaseConfig";

const TASKS_COLLECTION = "tasks";

// Create a new task
export const createTask = async (taskId, taskData) => {
  try {
    await setDoc(doc(db, TASKS_COLLECTION, taskId), {
      ...taskData,
      createdAt: new Date(),
    });
    return { id: taskId, ...taskData };
  } catch (error) {
    console.error("Error creating task:", error);
    throw error;
  }
};

// Get all tasks (one-time fetch)
export const getTasks = async () => {
  try {
    const q = query(collection(db, TASKS_COLLECTION), limit(100));
    const querySnapshot = await getDocs(q);
    const tasks = [];
    querySnapshot.forEach((doc) => {
      tasks.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    return tasks;
  } catch (error) {
    console.error("Error fetching tasks:", error);
    throw error;
  }
};

// Subscribe to real-time updates
export const subscribeTasks = (callback) => {
  try {
    const q = query(collection(db, TASKS_COLLECTION), limit(100));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const tasks = [];
        querySnapshot.forEach((doc) => {
          tasks.push({
            id: doc.id,
            ...doc.data(),
          });
        });
        callback(tasks);
      },
      (error) => {
        console.error("Error subscribing to tasks:", error);
        callback(null, error);
      },
    );

    return unsubscribe;
  } catch (error) {
    console.error("Error setting up subscription:", error);
    throw error;
  }
};

// Update a task
export const updateTask = async (taskId, updates) => {
  try {
    const taskRef = doc(db, TASKS_COLLECTION, taskId);
    await updateDoc(taskRef, updates);
    return { id: taskId, ...updates };
  } catch (error) {
    console.error("Error updating task:", error);
    throw error;
  }
};

// Delete a task
export const deleteTask = async (taskId) => {
  try {
    await deleteDoc(doc(db, TASKS_COLLECTION, taskId));
  } catch (error) {
    console.error("Error deleting task:", error);
    throw error;
  }
};
