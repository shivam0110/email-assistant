import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Example GET endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Hello from the example endpoint!',
    timestamp: new Date().toISOString(),
    method: 'GET'
  });
});

// Example POST endpoint with validation
const createExampleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  message: z.string().optional()
});

router.post('/', async (req, res, next) => {
  try {
    const data = createExampleSchema.parse(req.body);
    
    // Simulate some async processing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    res.status(201).json({
      success: true,
      message: 'Example created successfully',
      data: {
        id: Math.random().toString(36).substr(2, 9),
        ...data,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Example parameterized route
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  res.json({
    message: `Retrieved example with ID: ${id}`,
    id,
    timestamp: new Date().toISOString()
  });
});

export { router as exampleRoutes }; 