import type { DefaultSkillCategory } from '../types/resume.ts';
import { skillKey } from '../utils/text.ts';

/**
 * A curated technology vocabulary.
 *
 * Purpose is narrow and deliberate: recognising which words in a job
 * description are *technologies* rather than prose. It is used for detection
 * and normalisation only. It is never used to add a skill to a resume — that
 * would violate the truthfulness rule, since the source of truth is always the
 * master resume.
 */

export const CANONICAL_SKILLS: Record<string, string> = {};

function register(canonical: string, ...aliases: string[]): void {
  CANONICAL_SKILLS[skillKey(canonical)] = canonical;
  for (const a of aliases) CANONICAL_SKILLS[skillKey(a)] = canonical;
}

// Languages
register('Python', 'python3', 'py');
register('Java');
register('JavaScript', 'js', 'ecmascript');
register('TypeScript', 'ts');
register('C++', 'cpp', 'cplusplus');
register('C#', 'csharp', 'c sharp');
register('Go', 'golang');
register('Rust');
register('Ruby');
register('PHP');
register('Swift');
register('Kotlin');
register('Scala');
register('R');
register('SQL');
register('MATLAB');
register('Bash', 'shell', 'shell scripting');
register('C');

// Frameworks & libraries
register('React', 'react.js', 'reactjs');
register('Next.js', 'nextjs', 'next');
register('Angular', 'angularjs');
register('Vue', 'vue.js', 'vuejs');
register('Node.js', 'nodejs', 'node');
register('Express', 'express.js', 'expressjs');
register('Spring Boot', 'springboot', 'spring');
register('Django');
register('Flask');
register('FastAPI');
register('Rails', 'ruby on rails');
register('.NET', 'dotnet', 'asp.net');
register('Svelte');
register('Tailwind CSS', 'tailwind', 'tailwindcss');
register('Redux');
register('GraphQL');
register('gRPC');
register('REST APIs', 'rest', 'restful', 'rest api', 'restful apis');

// ML / data
register('PyTorch', 'torch');
register('TensorFlow', 'tf');
register('Keras');
register('scikit-learn', 'sklearn', 'scikit learn');
register('pandas');
register('NumPy', 'numpy');
register('Hugging Face', 'huggingface', 'transformers');
register('LangChain', 'langchain');
register('OpenCV', 'opencv');
register('Spark', 'apache spark', 'pyspark');
register('Hadoop');
register('Airflow', 'apache airflow');
register('Kafka', 'apache kafka');
register('Machine Learning', 'ml');
register('Deep Learning', 'dl');
register('NLP', 'natural language processing');
register('Computer Vision', 'cv');
register('LLM', 'llms', 'large language models', 'large language model');
register('RAG', 'retrieval augmented generation', 'retrieval-augmented generation');
register('MLOps', 'ml ops');
register('Recommendation Systems', 'recsys', 'recommender systems');
register('Reinforcement Learning', 'rl');
register('Feature Engineering');
register('Model Deployment');
register('Data Structures');
register('Algorithms');
register('Statistics');

// Data stores
register('PostgreSQL', 'postgres', 'psql');
register('MySQL');
register('MongoDB', 'mongo');
register('Redis');
register('DynamoDB');
register('Elasticsearch', 'elastic search', 'elk');
register('SQLite');
register('Cassandra');
register('Snowflake');
register('FAISS', 'faiss');
register('Pinecone');
register('Vector Databases', 'vector database', 'vector db');

// Cloud / infra / tools
register('AWS', 'amazon web services');
register('Azure', 'microsoft azure');
register('GCP', 'google cloud', 'google cloud platform');
register('Docker');
register('Kubernetes', 'k8s');
register('Terraform');
register('Jenkins');
register('CI/CD', 'cicd', 'continuous integration', 'continuous delivery');
register('GitHub Actions', 'github action');
register('Git');
register('Linux', 'unix');
register('Jira');
register('Postman');
register('Microservices', 'microservice', 'micro services');
register('SageMaker', 'aws sagemaker', 'amazon sagemaker');
register('Lambda', 'aws lambda');
register('S3', 'aws s3');
register('EC2', 'aws ec2');
register('Weights & Biases', 'wandb', 'weights and biases');
register('MLflow', 'ml flow');
register('Serverless');
register('System Design');
register('Distributed Systems');
register('Agile', 'scrum');
register('Unit Testing', 'unit tests');
register('JUnit');
register('Mockito');
register('Jest');
register('Pytest', 'py test');
register('Selenium');
register('JWT', 'json web token', 'json web tokens');
register('OAuth', 'oauth2');
register('WebSockets', 'websocket');
register('HTML');
register('CSS');
register('Sass', 'scss');
register('Figma');

/**
 * Maps a canonical skill onto one of the app's default Skills categories.
 * Used only to place a JD-only keyword into the right category when
 * injecting it (the skills-fabrication override, scoped to this app's
 * custom LaTeX template) — never to add a skill on its own. "Core CS" is
 * deliberately never a target: it is exclusively evidence-derived from an
 * existing claim in the resume's own text (see parsers/signals.ts).
 */
const CATEGORY_GROUPS: Record<DefaultSkillCategory, string[]> = {
  Programming: [
    'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP',
    'Swift', 'Kotlin', 'Scala', 'R', 'SQL', 'MATLAB', 'Bash', 'C', 'Data Structures', 'Algorithms',
  ],
  'Core CS': [],
  'Frameworks & Libraries': [
    'React', 'Next.js', 'Angular', 'Vue', 'Node.js', 'Express', 'Spring Boot', 'Django', 'Flask',
    'FastAPI', 'Rails', '.NET', 'Svelte', 'Tailwind CSS', 'Redux', 'GraphQL', 'gRPC', 'REST APIs',
    'HTML', 'CSS', 'Sass',
  ],
  Databases: [
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Elasticsearch', 'SQLite', 'Cassandra',
    'Snowflake', 'FAISS', 'Pinecone', 'Vector Databases',
  ],
  'Developer Tools & Platforms': [
    'Git', 'Linux', 'Jira', 'Postman', 'Microservices', 'System Design', 'Distributed Systems',
    'Unit Testing', 'JUnit', 'Mockito', 'Jest', 'Pytest', 'Selenium', 'JWT', 'OAuth', 'WebSockets',
    'Figma', 'Agile',
  ],
  'Cloud & Deployment': [
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'CI/CD',
    'GitHub Actions', 'Serverless', 'SageMaker', 'Lambda', 'S3', 'EC2', 'MLflow', 'Weights & Biases',
  ],
  'AI Automation & Machine Learning': [
    'PyTorch', 'TensorFlow', 'Keras', 'scikit-learn', 'Hugging Face', 'LangChain', 'OpenCV',
    'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'LLM', 'RAG', 'MLOps',
    'Recommendation Systems', 'Reinforcement Learning', 'Feature Engineering', 'Model Deployment',
  ],
  'Data Science & Analytics': ['pandas', 'NumPy', 'Spark', 'Hadoop', 'Airflow', 'Kafka', 'Statistics'],
  'Soft Skills': [],
};

export const CANONICAL_SKILL_CATEGORY: Record<string, DefaultSkillCategory> = {};
for (const [category, names] of Object.entries(CATEGORY_GROUPS) as Array<[DefaultSkillCategory, string[]]>) {
  for (const name of names) CANONICAL_SKILL_CATEGORY[name] = category;
}

/** Multi-word canonical names, longest first, for greedy phrase matching. */
export const MULTIWORD_SKILLS: string[] = Object.values(CANONICAL_SKILLS)
  .filter((v, i, arr) => arr.indexOf(v) === i)
  .filter((v) => v.includes(' ') || v.includes('/'))
  .sort((a, b) => b.length - a.length);

/** Returns the canonical spelling of a term, or null if it isn't known tech. */
export function canonicalize(term: string): string | null {
  return CANONICAL_SKILLS[skillKey(term)] ?? null;
}

/**
 * Finds every known technology mentioned in free text.
 * Word-boundary anchored so "R" doesn't match every capital R in the document
 * and "Go" doesn't match "going".
 */
export function detectSkills(text: string): string[] {
  const found = new Set<string>();
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9+#./\s-]/g, ' ').replace(/\s+/g, ' ')} `;

  for (const canonical of Object.values(CANONICAL_SKILLS)) {
    for (const alias of aliasesOf(canonical)) {
      const needle = alias.toLowerCase();
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i');
      if (re.test(lower)) {
        found.add(canonical);
        break;
      }
    }
  }
  return [...found];
}

let aliasIndex: Map<string, string[]> | null = null;

function aliasesOf(canonical: string): string[] {
  if (!aliasIndex) {
    aliasIndex = new Map();
    for (const [key, value] of Object.entries(CANONICAL_SKILLS)) {
      const list = aliasIndex.get(value) ?? [];
      list.push(key);
      aliasIndex.set(value, list);
    }
    // Prefer the canonical spelling itself, then longer aliases.
    for (const [value, list] of aliasIndex) {
      list.sort((a, b) => b.length - a.length);
      aliasIndex.set(value, [value, ...list]);
    }
  }
  return aliasIndex.get(canonical) ?? [canonical];
}
