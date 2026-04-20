/* Shared glossary for the lab pages. Every entry has:
     title      — appears in the tooltip header
     body       — one-line-ish explanation (HTML allowed for <code>, <em>, etc.)
     related    — keys of neighbouring concepts (render as clickable chips)
     sections   — {id, label} for scroll-to-section links inside a lab page
   Keys are lowercase, hyphenated, and flat across both labs so a chip in
   one lab can link to a concept introduced in the other (e.g. 'kl' is
   used by both RL's on/off-policy discussion and Diffusion's ELBO). */

// Section helpers carry an `href` so the tooltip engine can navigate
// cross-lab when the section isn't on the current page. Same-page links
// still scroll smoothly because the engine tries getElementById first.
const RL_SEC = (id, label) => ({ id, label: `RL · ${label}`, href: '../rl-lab/' });
const DF_SEC = (id, label) => ({ id, label: `Diffusion · ${label}`, href: '../diffusion-lab/' });
const MATH_SEC = (id, label) => ({ id, label: `Math · ${label}`, href: '../math-lab/' });
const CML_SEC = (id, label) => ({ id, label: `Classical · ${label}`, href: '../classical-ml/' });
const ML_SEC = (label) => ({ id: '', label: `Clustering · ${label}`, href: '../ml-playground/' });
const FOURIER_SEC = (label) => ({ id: '', label: `Fourier · ${label}`, href: '../fourier-epicycles/' });

export const GLOSSARY = {
  // ====================== RL — core variables ======================
  'epsilon': {
    title: 'ε · probability of exploration',
    body: 'ε is the <em>probability of picking a random action (exploring)</em> each step. Its complement 1 − ε is the probability of picking the current-best-estimated action (exploiting). ε=0 is pure exploit — locks in on the first apparent winner. ε=1 is pure random. 0.05–0.1 is typical; decayed over time is common.',
    related: ['epsilon-greedy', 'exploration-exploitation', 'ucb1', 'thompson'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'gamma': {
    title: 'γ · discount factor',
    body: 'Weight on future rewards in the return G<sub>t</sub>. γ≈0 is myopic ("candy now"); γ→1 is patient. γ<1 keeps the infinite sum finite and makes the Bellman operator a contraction.',
    related: ['return', 'bellman', 'mdp', 'contraction'],
    sections: [RL_SEC('theory-mdp', '§2 MDP')]
  },
  'alpha-step': {
    title: 'α · step size (learning rate)',
    body: 'How much to nudge an estimate toward its target in each update: V ← V + α[target − V]. Small α = slow but stable; large α = fast but jittery. Often decayed over time.',
    related: ['td-error', 'monte-carlo', 'td0', 'q-learning'],
    sections: [RL_SEC('theory-mc-td', '§5 MC vs TD'), RL_SEC('theory-shape', '§8 Same shape')]
  },
  'alpha-bandit': {
    title: 'α<sub>k</sub>, β<sub>k</sub> · Beta posterior counts (bandit)',
    body: 'Thompson sampling keeps a Beta(α<sub>k</sub>, β<sub>k</sub>) posterior per arm — successes + 1 and failures + 1. Draw one sample from each, pull the arm with the highest sample.',
    related: ['thompson', 'bandit']
  },
  'q-value': {
    title: 'Q(s, a) · action-value',
    body: 'Expected return starting in state s, taking action a first, then following policy π thereafter. The quantity SARSA and Q-learning learn. Q<sup>*</sup> = optimal Q; greedy on Q<sup>*</sup> is an optimal policy.',
    related: ['v-value', 'advantage', 'bellman', 'q-learning', 'sarsa'],
    sections: [RL_SEC('theory-values', '§3 Value functions')]
  },
  'v-value': {
    title: 'V(s) · state-value',
    body: 'Expected return from state s under policy π. V<sup>π</sup>(s) = 𝔼<sub>π</sub>[G<sub>t</sub> | S<sub>t</sub> = s]. Related to Q by V(s) = Σ<sub>a</sub> π(a|s) Q(s, a).',
    related: ['q-value', 'return', 'bellman', 'advantage'],
    sections: [RL_SEC('theory-values', '§3 Value functions')]
  },
  'advantage': {
    title: 'A(s, a) · advantage',
    body: 'A<sup>π</sup>(s, a) = Q<sup>π</sup>(s, a) − V<sup>π</sup>(s). "How much better than average is action a here?" Subtracting V(s) as a baseline reduces variance of policy-gradient estimates.',
    related: ['q-value', 'v-value', 'policy-gradient', 'actor-critic'],
    sections: [RL_SEC('theory-values', '§3 Value functions'), RL_SEC('theory-pg', '§7 Policy gradient')]
  },
  'policy': {
    title: 'π(a | s) · policy',
    body: 'The agent\'s strategy: probability of action a in state s. Deterministic policies put all mass on one action. Stochastic policies are required for policy-gradient methods and for provable exploration.',
    related: ['policy-gradient', 'on-policy', 'off-policy', 'bellman'],
    sections: [RL_SEC('theory-mdp', '§2 MDP')]
  },
  'theta-policy': {
    title: 'θ · policy parameters',
    body: 'Learnable weights of the policy network π<sub>θ</sub>(a | s). Gradient ascent on the expected return J(θ) updates θ.',
    related: ['policy-gradient', 'actor-critic', 'phi-critic']
  },
  'phi-critic': {
    title: 'φ · critic parameters',
    body: 'Learnable weights of the critic network V<sub>φ</sub> or Q<sub>φ</sub>. In actor-critic the actor (θ) and critic (φ) are trained jointly.',
    related: ['actor-critic', 'theta-policy', 'v-value']
  },
  'return': {
    title: 'G<sub>t</sub> · return',
    body: 'Discounted sum of future rewards: G<sub>t</sub> = R<sub>t+1</sub> + γR<sub>t+2</sub> + γ²R<sub>t+3</sub> + … . The thing every RL method is ultimately trying to maximise (in expectation).',
    related: ['gamma', 'v-value', 'monte-carlo'],
    sections: [RL_SEC('theory-mdp', '§2 MDP')]
  },
  'td-error': {
    title: 'δ<sub>t</sub> · TD error',
    body: '"Surprise" at each step: δ<sub>t</sub> = r<sub>t+1</sub> + γV(s<sub>t+1</sub>) − V(s<sub>t</sub>). Drives TD, SARSA, Q-learning, and actor-critic updates. Instance of the broader "estimate ← estimate + α·[target − estimate]" stochastic-approximation shape.',
    related: ['td0', 'sarsa', 'q-learning', 'actor-critic', 'bellman'],
    sections: [
      RL_SEC('theory-mc-td', '§5 MC vs TD'),
      RL_SEC('theory-shape', '§8 Same-shape updates'),
      MATH_SEC('theory-gd', '§2 stochastic approximation')
    ]
  },
  'rho-ratio': {
    title: 'ρ · importance weight',
    body: 'Ratio π(a|s) / μ(a|s) correcting an expectation taken under behaviour policy μ back to target policy π. Products over trajectories can explode — weighted IS helps.',
    related: ['importance-sampling', 'on-policy', 'off-policy'],
    sections: [RL_SEC('theory-on-off', '§6 On/off-policy')]
  },
  'mu-arm': {
    title: 'μ<sub>a</sub> · true arm mean (bandit)',
    body: 'Hidden expected reward of arm a. The agent never observes μ<sub>a</sub> directly — only noisy samples. Its estimate is Q(a).',
    related: ['sigma-arm', 'q-value', 'bandit']
  },
  'sigma-arm': {
    title: 'σ<sub>a</sub> · arm noise std (bandit)',
    body: 'Standard deviation of the reward distribution for arm a. Bigger σ = noisier pulls; needs more samples for the estimate to settle.',
    related: ['mu-arm', 'bandit', 'thompson', 'ucb1']
  },
  'regret': {
    title: 'Regret',
    body: 'Cumulative expected reward lost by not always pulling the best arm: Σ<sub>t</sub> (μ<sup>*</sup> − μ<sub>a<sub>t</sub></sub>). Good strategies have log-t regret; bad ones (pure greedy) can have linear regret.',
    related: ['epsilon-greedy', 'ucb1', 'thompson', 'bandit']
  },

  // ====================== RL — methods ======================
  'bandit': {
    title: 'Multi-armed bandit',
    body: 'RL with no state: k arms, each a distribution. Pick an arm, get a reward, update. Isolates the exploration/exploitation trade-off from the rest of RL.',
    related: ['epsilon-greedy', 'ucb1', 'thompson', 'regret'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'mdp': {
    title: 'Markov Decision Process',
    body: 'Tuple (S, A, P, R, γ). Adds state and time to a bandit. The Markov property: next state depends only on current (s, a), not history. Every "full RL" method assumes an MDP.',
    related: ['gamma', 'policy', 'bellman', 'v-value'],
    sections: [RL_SEC('theory-mdp', '§2 MDP')]
  },
  'bellman': {
    title: 'Bellman equation',
    body: 'Recursive identity: V<sup>π</sup>(s) = 𝔼[r + γV<sup>π</sup>(s\')]. The optimal version replaces the expectation with a max. Every RL update is a noisy, approximate Bellman backup. A fixed-point equation; solved by iteration (§4 DP) or stochastic approximation (MC / TD).',
    related: ['v-value', 'q-value', 'contraction', 'value-iteration'],
    sections: [
      RL_SEC('theory-values', '§3 Value functions'),
      RL_SEC('theory-dp', '§4 DP (Bellman fixed-point iteration)'),
      MATH_SEC('theory-opt', '§1 Optimisation (fixed-point / argmin connection)')
    ]
  },
  'contraction': {
    title: 'γ-contraction',
    body: 'The Bellman operator T shrinks the max error by a factor of γ each sweep: ‖TV − TV\'‖<sub>∞</sub> ≤ γ‖V − V\'‖<sub>∞</sub>. This is why value iteration converges geometrically.',
    related: ['bellman', 'value-iteration', 'gamma']
  },
  'value-iteration': {
    title: 'Value iteration',
    body: 'Sweep V(s) ← max<sub>a</sub> Σ P(s\'|s,a)[r + γV(s\')] until Δ<sub>max</sub> is small. Fuses policy evaluation and improvement. Requires a known model.',
    related: ['policy-iteration', 'bellman', 'contraction', 'dp'],
    sections: [RL_SEC('theory-dp', '§4 DP'), RL_SEC('demo-chain', 'Chain demo')]
  },
  'policy-iteration': {
    title: 'Policy iteration',
    body: 'Alternate policy evaluation (solve V<sup>π</sup>) and policy improvement (π ← greedy on V<sup>π</sup>). Fewer outer iterations than value iteration, each does more work.',
    related: ['value-iteration', 'bellman', 'dp'],
    sections: [RL_SEC('theory-dp', '§4 DP')]
  },
  'dp': {
    title: 'Dynamic programming (DP)',
    body: 'Solving an MDP when P and R are known, by iterating Bellman backups. Value iteration and policy iteration are the two classics.',
    related: ['value-iteration', 'policy-iteration', 'bellman', 'model-based']
  },
  'monte-carlo': {
    title: 'Monte Carlo (MC)',
    body: 'Update using the actual return G<sub>t</sub> from a completed episode: V(s) ← V(s) + α[G<sub>t</sub> − V(s)]. Unbiased, high variance, requires episode termination.',
    related: ['td0', 'td-lambda', 'alpha-step', 'return', 'mc-integration'],
    sections: [
      RL_SEC('theory-mc-td', '§5 MC vs TD'),
      RL_SEC('demo-darts', '§5 darts demo')
    ]
  },
  'td0': {
    title: 'TD(0)',
    body: 'Bootstrap after one step: V(s) ← V(s) + α[r + γV(s\') − V(s)]. Biased early, low variance, works online.',
    related: ['monte-carlo', 'td-lambda', 'td-error', 'sarsa', 'q-learning'],
    sections: [RL_SEC('theory-mc-td', '§5 MC vs TD')]
  },
  'td-lambda': {
    title: 'n-step TD · TD(λ)',
    body: 'Interpolate MC and TD(0). n-step uses n rewards + V(s<sub>t+n</sub>); TD(λ) averages every n with weight (1−λ)λ<sup>n−1</sup>. Tunes bias/variance trade-off.',
    related: ['monte-carlo', 'td0', 'td-error']
  },
  'sarsa': {
    title: 'SARSA',
    body: 'On-policy Q-update: Q(s,a) ← Q(s,a) + α[r + γQ(s\', <em>a\'</em>) − Q(s,a)], where a\' is the action actually taken next. Learns the Q of whatever behaviour is running.',
    related: ['q-learning', 'on-policy', 'td-error', 'expected-sarsa'],
    sections: [RL_SEC('theory-on-off', '§6 On/off-policy')]
  },
  'q-learning': {
    title: 'Q-learning',
    body: 'Off-policy Q-update: Q(s,a) ← Q(s,a) + α[r + γ<em>max<sub>a\'</sub></em>Q(s\',a\') − Q(s,a)]. The max is what a greedy policy <em>would</em> do, regardless of what was actually done.',
    related: ['sarsa', 'off-policy', 'td-error', 'dqn'],
    sections: [RL_SEC('theory-on-off', '§6 On/off-policy')]
  },
  'expected-sarsa': {
    title: 'Expected SARSA',
    body: 'Average over next actions with the current policy: Q(s,a) ← Q(s,a) + α[r + γ Σ<sub>a\'</sub> π(a\'|s\') Q(s\',a\') − Q(s,a)]. Lower variance than SARSA; generalises both SARSA and Q-learning.',
    related: ['sarsa', 'q-learning', 'td-error']
  },
  'epsilon-greedy': {
    title: 'ε-greedy',
    body: 'Pick argmax<sub>a</sub> Q(a) with prob 1 − ε; random arm with prob ε. Cheap, effective, never stops wasting ε on known-bad arms.',
    related: ['epsilon', 'ucb1', 'thompson', 'exploration-exploitation'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'ucb1': {
    title: 'UCB1',
    body: 'Upper Confidence Bound: pick argmax<sub>a</sub> [Q(a) + c·σ<sub>a</sub>·√(ln t / N(a))]. Uncertain arms get a bonus. O(log t) regret.',
    related: ['epsilon-greedy', 'thompson', 'exploration-exploitation', 'regret'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'thompson': {
    title: 'Thompson sampling',
    body: 'Bayesian: keep a posterior over each arm\'s mean, sample once from each, pull the arm with the highest sample. Explores wide posteriors, exploits tight ones.',
    related: ['ucb1', 'epsilon-greedy', 'bandit', 'posterior'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'exploration-exploitation': {
    title: 'Exploration vs exploitation',
    body: 'The core RL dilemma: try new actions to <em>learn</em>, or repeat known-good actions to <em>earn</em>. Every algorithm picks some balance.',
    related: ['epsilon-greedy', 'ucb1', 'thompson', 'policy']
  },
  'on-policy': {
    title: 'On-policy learning',
    body: 'Learn from trajectories generated by the <em>current</em> policy. Safer during exploration. Examples: SARSA, REINFORCE, PPO.',
    related: ['off-policy', 'sarsa', 'importance-sampling'],
    sections: [RL_SEC('theory-on-off', '§6 On/off-policy')]
  },
  'off-policy': {
    title: 'Off-policy learning',
    body: 'Learn from trajectories from a <em>different</em> behaviour policy μ. Can reuse replay buffers and demonstrations. Examples: Q-learning, DDPG, SAC.',
    related: ['on-policy', 'q-learning', 'importance-sampling', 'replay-buffer'],
    sections: [RL_SEC('theory-on-off', '§6 On/off-policy')]
  },
  'importance-sampling': {
    title: 'Importance sampling',
    body: '𝔼<sub>π</sub>[f] = 𝔼<sub>μ</sub>[ρ·f] with ρ = π/μ. Unbiased reweighting of data from μ to look like data from π. Variance explodes over long trajectories; weighted IS trades bias for stability.',
    related: ['rho-ratio', 'off-policy', 'on-policy']
  },
  'policy-gradient': {
    title: 'Policy gradient',
    body: '∇<sub>θ</sub> J(θ) = 𝔼[∇<sub>θ</sub> log π<sub>θ</sub>(a|s) · Ψ<sub>t</sub>]. Directly moves θ to make good actions more likely. Ψ<sub>t</sub> can be G<sub>t</sub>, Q, A, or δ<sub>t</sub>.',
    related: ['reinforce', 'actor-critic', 'advantage', 'theta-policy'],
    sections: [RL_SEC('theory-pg', '§7 Policy gradient')]
  },
  'reinforce': {
    title: 'REINFORCE',
    body: 'Policy gradient with Ψ<sub>t</sub> = G<sub>t</sub>. Pure Monte Carlo, unbiased, very high variance.',
    related: ['policy-gradient', 'monte-carlo', 'actor-critic'],
    sections: [RL_SEC('theory-pg', '§7 Policy gradient')]
  },
  'actor-critic': {
    title: 'Actor-critic',
    body: 'Hybrid: an <em>actor</em> π<sub>θ</sub> + a <em>critic</em> V<sub>φ</sub> (or Q<sub>φ</sub>). Critic supplies a lower-variance Ψ<sub>t</sub> (usually the TD error δ<sub>t</sub>).',
    related: ['policy-gradient', 'td-error', 'theta-policy', 'phi-critic', 'ppo', 'sac'],
    sections: [RL_SEC('theory-pg', '§7 Policy gradient')]
  },
  'ppo': {
    title: 'PPO',
    body: 'Actor-critic + on-policy + GAE advantage target + clipped-ratio surrogate loss. The default workhorse of deep RL. Stable, but sample-inefficient.',
    related: ['actor-critic', 'on-policy', 'trpo', 'advantage']
  },
  'sac': {
    title: 'SAC · Soft Actor-Critic',
    body: 'Actor-critic + off-policy + entropy-regularised (keeps the policy exploring). Works on continuous action spaces. Widely used in robotics.',
    related: ['actor-critic', 'off-policy', 'ddpg', 'td3', 'entropy-bonus']
  },
  'dqn': {
    title: 'DQN',
    body: 'Deep Q-learning: a neural net approximates Q(s, a); targets use a periodically-copied target net; transitions go through a replay buffer.',
    related: ['q-learning', 'replay-buffer', 'off-policy']
  },
  'ddpg': {
    title: 'DDPG / TD3',
    body: 'Deterministic policy-gradient + Q-critic + replay + target networks. TD3 adds delayed updates + target smoothing to fix overestimation.',
    related: ['sac', 'q-learning', 'actor-critic', 'off-policy']
  },
  'trpo': {
    title: 'TRPO',
    body: 'Trust-Region Policy Optimization. Constrain each policy update to a KL ball around the old policy. Theoretically grounded; PPO is the practical simplification.',
    related: ['ppo', 'actor-critic', 'kl']
  },
  'replay-buffer': {
    title: 'Replay buffer',
    body: 'Fixed-size ring buffer storing past (s, a, r, s\') transitions. Sampling mini-batches decorrelates updates and enables off-policy learning from old data.',
    related: ['off-policy', 'dqn', 'sac']
  },
  'entropy-bonus': {
    title: 'Entropy bonus',
    body: 'Add β·H[π(·|s)] to the loss to reward policy entropy. Prevents premature collapse to a single action. Core to SAC; also used in A3C/PPO. Structurally the same as a "keep the policy spread" regulariser.',
    related: ['sac', 'exploration-exploitation', 'regularisation'],
    sections: [
      RL_SEC('theory-pg', '§7 Policy gradient'),
      CML_SEC('theory-gen', '§6 Regularisation (kinship)')
    ]
  },
  'model-based': {
    title: 'Model-based RL',
    body: 'Learn (or be given) P and R, then plan. Can wrap any of the other families. Examples: Dyna-Q, MuZero, AlphaZero, Dreamer, PETS.',
    related: ['model-free', 'dp', 'value-iteration']
  },
  'model-free': {
    title: 'Model-free RL',
    body: 'Learn values or policies directly from samples — no explicit model of P, R. Most deep-RL methods (DQN, PPO, SAC) are model-free.',
    related: ['model-based', 'monte-carlo', 'td0']
  },

  // ====================== Diffusion — core variables ======================
  'beta-t': {
    title: 'β<sub>t</sub> · forward noise variance',
    body: 'Per-step noise added in the forward process q(x<sub>t</sub> | x<sub>t−1</sub>) = 𝒩(√(1−β<sub>t</sub>) x<sub>t−1</sub>, β<sub>t</sub> I). Schedule is fixed, not learned (linear, cosine, etc.).',
    related: ['alpha-t', 'alpha-bar-t', 'ddpm', 'noise-schedule'],
    sections: [DF_SEC('theory-ddpm', '§4 DDPM')]
  },
  'alpha-t': {
    title: 'α<sub>t</sub> · per-step signal factor',
    body: 'α<sub>t</sub> = 1 − β<sub>t</sub>. Single-step signal-preservation factor in DDPM.',
    related: ['alpha-bar-t', 'beta-t', 'ddpm']
  },
  'alpha-bar-t': {
    title: 'ᾱ<sub>t</sub> · cumulative signal factor',
    body: 'ᾱ<sub>t</sub> = ∏<sub>s=1..t</sub> α<sub>s</sub>. Lets you sample x<sub>t</sub> from x<sub>0</sub> in one shot: x<sub>t</sub> = √ᾱ<sub>t</sub> x<sub>0</sub> + √(1−ᾱ<sub>t</sub>) ε.',
    related: ['beta-t', 'alpha-t', 'ddpm', 'noise-schedule'],
    sections: [DF_SEC('theory-ddpm', '§4 DDPM')]
  },
  'noise-schedule': {
    title: 'Noise schedule',
    body: 'Pre-chosen sequence β<sub>1</sub>, …, β<sub>T</sub>. Linear, cosine, or sigmoid. Determines how quickly x<sub>0</sub> → pure noise.',
    related: ['beta-t', 'alpha-bar-t', 'ddpm', 'vp-sde', 've-sde']
  },
  'epsilon-noise': {
    title: 'ε · noise sample',
    body: 'Standard Gaussian 𝒩(0, I). The "snow" added in diffusion; the target DDPM\'s network predicts. Not to be confused with RL\'s exploration ε.',
    related: ['ddpm', 'score', 'reparam']
  },
  'x0-data': {
    title: 'x<sub>0</sub> · clean data',
    body: 'A sample from the data distribution (a real image, a real audio clip). The forward process starts here.',
    related: ['x-t', 'ddpm']
  },
  'x-t': {
    title: 'x<sub>t</sub> · noisy latent at step t',
    body: 'Partially-noised data: x<sub>t</sub> = √ᾱ<sub>t</sub> x<sub>0</sub> + √(1−ᾱ<sub>t</sub>) ε. At t=0 it\'s x<sub>0</sub>; at t=T it\'s ≈ 𝒩(0, I).',
    related: ['x0-data', 'alpha-bar-t', 'ddpm']
  },
  'sigma-tilde-t': {
    title: 'σ̃<sub>t</sub> · reverse-step stddev',
    body: 'Noise added back on each DDPM reverse step: σ̃<sub>t</sub>² = β<sub>t</sub>(1−ᾱ<sub>t−1</sub>)/(1−ᾱ<sub>t</sub>). Option: use β<sub>t</sub> itself (larger). Zero at t=1.',
    related: ['ddpm', 'beta-t', 'alpha-bar-t']
  },
  'score': {
    title: '∇<sub>x</sub> log p(x) · score',
    body: 'Gradient of log-density. Points uphill on the probability landscape. Training a "score model" s<sub>θ</sub> ≈ ∇ log p lets you run Langevin dynamics to sample.',
    related: ['score-matching', 'langevin', 'dsm', 'ddpm'],
    sections: [DF_SEC('theory-score', '§5 Score matching')]
  },
  'z-latent': {
    title: 'z · latent variable',
    body: 'Unobserved random variable that "explains" the data. In VAEs z sits in a small code space; in diffusion every noisy x<sub>t</sub> plays the role of z.',
    related: ['vae', 'elbo', 'reparam']
  },
  'mu-phi': {
    title: 'μ<sub>φ</sub>(x), σ<sub>φ</sub>(x) · VAE encoder outputs',
    body: 'Learned mean and std of the encoder q<sub>φ</sub>(z|x) = 𝒩(μ<sub>φ</sub>(x), σ<sub>φ</sub>²(x) I). φ are the encoder\'s weights.',
    related: ['vae', 'reparam', 'elbo']
  },
  'kl': {
    title: 'D<sub>KL</sub>(p ‖ q) · KL divergence',
    body: 'Asymmetric "distance" from p to q: 𝔼<sub>p</sub>[log(p/q)]. Not a metric. Minimising forward KL = MLE (mean-seeking); reverse KL is mode-seeking.',
    related: ['forward-kl', 'reverse-kl', 'elbo', 'vae', 'cross-entropy', 'mle'],
    sections: [
      DF_SEC('theory-kl', '§1 KL divergence'),
      DF_SEC('theory-vae', '§2 VAE (ELBO has a KL term)'),
      RL_SEC('theory-pg', '§7 TRPO / PPO uses KL')
    ]
  },
  'forward-kl': {
    title: 'Forward KL · D<sub>KL</sub>(p<sub>data</sub> ‖ q<sub>θ</sub>)',
    body: 'Minimising is equivalent to maximum likelihood. Mean-seeking: q<sub>θ</sub> covers all modes of p<sub>data</sub>, even at cost of spreading mass over low-data regions.',
    related: ['kl', 'reverse-kl', 'elbo']
  },
  'reverse-kl': {
    title: 'Reverse KL · D<sub>KL</sub>(q<sub>θ</sub> ‖ p)',
    body: 'Mode-seeking: q<sub>θ</sub> ducks low-probability regions of p, often locking onto one mode. The variational-inference loss.',
    related: ['kl', 'forward-kl', 'elbo']
  },
  'elbo': {
    title: 'ELBO · Evidence Lower BOund',
    body: 'log p(x) ≥ 𝔼<sub>q</sub>[log p<sub>θ</sub>(x|z)] − D<sub>KL</sub>(q<sub>φ</sub>(z|x) ‖ p(z)). Maximising is what VAEs and diffusion do (diffusion\'s L<sub>simple</sub> falls out of a hierarchical-VAE ELBO).',
    related: ['vae', 'kl', 'ddpm', 'reparam'],
    sections: [DF_SEC('theory-vae', '§2 VAE')]
  },
  'reparam': {
    title: 'Reparameterisation trick',
    body: 'Rewrite z ~ 𝒩(μ, σ²) as z = μ + σ ε with ε ~ 𝒩(0, I) so gradients flow through μ and σ. Core to VAEs; also how DDPM ε-prediction is structured.',
    related: ['vae', 'elbo', 'epsilon-noise'],
    sections: [
      DF_SEC('theory-vae', '§2 VAE reparam'),
      DF_SEC('theory-ddpm', '§4 DDPM ε-parameterisation')
    ]
  },
  'langevin': {
    title: 'Langevin dynamics',
    body: 'Sampling iteration x ← x + (η/2) s<sub>θ</sub>(x) + √η z. As η→0 and K→∞, the chain mixes to p(x). Annealed across noise scales = SMLD.',
    related: ['score', 'smld', 'dsm'],
    sections: [DF_SEC('theory-score', '§5 Score matching')]
  },
  'eta-langevin': {
    title: 'η · Langevin step size',
    body: 'Gradient step for Langevin dynamics. Small η and large K give accurate samples. Each Langevin step is one noisy climb of the score.',
    related: ['langevin', 'score']
  },
  'dW': {
    title: 'dW · Brownian increment',
    body: 'Infinitesimal random kick of a Wiener process. Each dW is independent 𝒩(0, dt). Forward SDEs add g(t) dW; reverse SDEs replace dW with reverse-time dW̄.',
    related: ['sde', 'brownian', 'reverse-sde']
  },
  'dW-bar': {
    title: 'dW̄ · reverse-time Brownian',
    body: 'Wiener increment for time flowing backward (T → 0). Appears in Anderson\'s reverse-time SDE. Independent of dW.',
    related: ['dW', 'reverse-sde', 'sde']
  },
  'theta-minus': {
    title: 'θ⁻ · target / EMA weights',
    body: 'Slowly-updated copy of the model\'s weights used as a stable regression target. Standard trick in DQN, SAC, and Consistency Models.',
    related: ['consistency-models', 'sac', 'dqn']
  },
  'empty-cond': {
    title: '∅ · null conditioning',
    body: 'Special token/embedding standing for "no condition." Used in classifier-free guidance so one model can do both conditional and unconditional prediction.',
    related: ['cfg', 'conditioning']
  },
  'conditioning': {
    title: 'c · conditioning signal',
    body: 'Extra input to a diffusion model: text prompt, class label, image mask, etc. The network predicts ε<sub>θ</sub>(x<sub>t</sub>, t, c) conditioned on c.',
    related: ['cfg', 'empty-cond', 'latent-diffusion']
  },
  'guidance-scale': {
    title: 'w · guidance scale',
    body: 'Strength of classifier-free guidance. w=0 is pure conditional; w>0 extrapolates further in the direction of the condition. Too-large w looks oversaturated / artefact-y.',
    related: ['cfg', 'conditioning']
  },

  // ====================== Diffusion — methods ======================
  'vae': {
    title: 'VAE · Variational Autoencoder',
    body: 'Encoder q<sub>φ</sub>(z|x), decoder p<sub>θ</sub>(x|z), prior p(z) = 𝒩(0, I). Trained by maximising the ELBO. Ancestor of diffusion (which is a hierarchical VAE with fixed encoder).',
    related: ['elbo', 'reparam', 'kl', 'ddpm', 'latent-diffusion', 'mle'],
    sections: [
      DF_SEC('theory-vae', '§2 VAE'),
      CML_SEC('theory-mle', '§2 MLE (ELBO generalises MLE)')
    ]
  },
  'brownian': {
    title: 'Brownian motion',
    body: 'Continuous-time limit of a Gaussian random walk. W<sub>t</sub> ~ 𝒩(0, t). Building block of every forward/reverse SDE in diffusion.',
    related: ['sde', 'dW', 'random-walk'],
    sections: [DF_SEC('theory-rw', '§3 Random walk')]
  },
  'random-walk': {
    title: 'Random walk',
    body: 'Discrete stochastic process x<sub>t+1</sub> = x<sub>t</sub> + η<sub>t</sub>. Var grows linearly in t. Continuous-time limit is Brownian motion; adding drift & diffusion coefficients gives an SDE.',
    related: ['brownian', 'sde'],
    sections: [DF_SEC('theory-rw', '§3 Random walk')]
  },
  'sde': {
    title: 'SDE · Stochastic differential equation',
    body: 'dx = f(x, t) dt + g(t) dW. Drift f + noise g·dW. Every diffusion method is a discretisation of an SDE (VP for DDPM, VE for SMLD).',
    related: ['vp-sde', 've-sde', 'reverse-sde', 'pf-ode', 'dW'],
    sections: [DF_SEC('theory-sde', '§6 SDE')]
  },
  'reverse-sde': {
    title: 'Reverse SDE',
    body: 'Anderson 1982: if a forward SDE has dx = f dt + g dW, time-reversing gives dx = [f − g²∇ log p<sub>t</sub>] dt + g dW̄. Only unknown is the score.',
    related: ['sde', 'score', 'dW-bar', 'pf-ode']
  },
  'pf-ode': {
    title: 'Probability-flow ODE',
    body: 'Deterministic companion of the reverse SDE: dx = [f − ½g² ∇ log p<sub>t</sub>] dt. Same marginals as the SDE but integrable with ODE solvers (Heun, RK45). Enables exact likelihoods and 20-step samplers.',
    related: ['sde', 'reverse-sde', 'ddim', 'dpm-solver']
  },
  'vp-sde': {
    title: 'VP-SDE · Variance Preserving',
    body: 'f = −½β(t) x, g = √β(t). The continuous-time DDPM. Marginals stay bounded: as t→∞, x → 𝒩(0, I).',
    related: ['sde', 've-sde', 'ddpm']
  },
  've-sde': {
    title: 'VE-SDE · Variance Exploding',
    body: 'f = 0, g = √(d[σ²]/dt). The continuous-time SMLD. Marginal variance grows unboundedly (capped at σ<sub>max</sub>²).',
    related: ['sde', 'vp-sde', 'smld']
  },
  'ddpm': {
    title: 'DDPM',
    body: 'Ho, Jain, Abbeel (2020). Fixed Markov forward chain with β schedule; network predicts ε; L<sub>simple</sub> = ‖ε − ε<sub>θ</sub>(x<sub>t</sub>, t)‖².',
    related: ['beta-t', 'alpha-bar-t', 'ddim', 'score', 'vp-sde'],
    sections: [DF_SEC('theory-ddpm', '§4 DDPM')]
  },
  'ddim': {
    title: 'DDIM',
    body: 'Non-Markov deterministic sampler. Same training loss as DDPM but at inference skips steps and drops the stochastic σ̃<sub>t</sub>. 1000 → 50 steps, nearly free.',
    related: ['ddpm', 'pf-ode', 'dpm-solver']
  },
  'smld': {
    title: 'SMLD · NCSN',
    body: 'Song & Ermon (2019). Train a score network at multiple noise scales; sample with annealed Langevin. Mathematically equivalent to DDPM up to parameterisation.',
    related: ['score', 'langevin', 've-sde', 'ddpm']
  },
  'score-matching': {
    title: 'Score matching',
    body: 'Fit s<sub>θ</sub>(x) ≈ ∇ log p(x) without ever computing p. Hyvärinen 2005 (sliced, implicit) and Vincent 2011 (denoising / DSM) are the practical forms.',
    related: ['score', 'dsm', 'langevin'],
    sections: [DF_SEC('theory-score', '§5 Score matching')]
  },
  'dsm': {
    title: 'DSM · Denoising Score Matching',
    body: 'Regress s<sub>θ</sub>(x̃, σ) against (x − x̃)/σ² for noisy x̃ = x + σε. Up to a scalar, equivalent to DDPM\'s ε-prediction loss.',
    related: ['score-matching', 'score', 'ddpm']
  },
  'cfg': {
    title: 'CFG · Classifier-free guidance',
    body: 'Train one model for both conditional and unconditional prediction (∅ as "no condition"). At inference, ε̃ = (1+w)ε<sub>θ</sub>(x, c) − wε<sub>θ</sub>(x, ∅). Pushes samples toward the condition.',
    related: ['guidance-scale', 'conditioning', 'empty-cond', 'ddpm']
  },
  'dpm-solver': {
    title: 'DPM-Solver',
    body: 'High-order ODE solver for the PF-ODE. Squeezes DDPM/DDIM sampling down to 10–20 steps with almost no quality loss.',
    related: ['pf-ode', 'ddim', 'ddpm']
  },
  'latent-diffusion': {
    title: 'Latent diffusion',
    body: 'Pre-train a VAE to map 512×512 images to 64×64 latents. Run diffusion in latent space — 64× fewer FLOPs per step. The basis of Stable Diffusion and Imagen.',
    related: ['vae', 'ddpm', 'stable-diffusion']
  },
  'stable-diffusion': {
    title: 'Stable Diffusion',
    body: 'Latent diffusion + CLIP text conditioning + CFG. The first open-source text-to-image model that ran on consumer GPUs. SD 3 switched to flow matching.',
    related: ['latent-diffusion', 'cfg', 'flow-matching']
  },
  'flow-matching': {
    title: 'Flow matching',
    body: 'Regress a velocity v<sub>θ</sub>(x<sub>t</sub>, t) along straight paths x<sub>t</sub> = (1−t)x<sub>0</sub> + t·x<sub>1</sub>. No noise schedule; ODE sampling only. SD 3, Flux, Veo.',
    related: ['rectified-flow', 'cnf', 'pf-ode']
  },
  'rectified-flow': {
    title: 'Rectified flow',
    body: 'A flavour of flow matching that iteratively straightens the learned paths between noise and data. Gives high-quality 1-step sampling after a "reflow" pass.',
    related: ['flow-matching', 'consistency-models']
  },
  'cnf': {
    title: 'CNF · Continuous Normalizing Flow',
    body: 'Parameterise dx/dt = v<sub>θ</sub>(x, t) and solve the ODE to transform noise into data. Older (Chen 2018) cousin of flow matching — same model, different training.',
    related: ['flow-matching', 'pf-ode']
  },
  'consistency-models': {
    title: 'Consistency models',
    body: 'Train f<sub>θ</sub>(x<sub>t</sub>, t) to predict the end of the PF-ODE trajectory (x<sub>0</sub>) regardless of t. Enables 1–4 step sampling. LCM is the latent version.',
    related: ['theta-minus', 'pf-ode', 'ddim', 'flow-matching']
  },
  'posterior': {
    title: 'Bayesian posterior',
    body: 'Distribution over a parameter <em>after</em> observing data: p(θ|𝒟) ∝ p(𝒟|θ) p(θ). Always a probability distribution over θ. Thompson sampling\'s heart; also the "z-posterior" in VAEs.',
    related: ['prior', 'likelihood', 'bayes-rule', 'thompson', 'vae', 'beta-distribution', 'map-estimate'],
    sections: [
      RL_SEC('theory-bandits', '§1 Bayesian coin'),
      DF_SEC('theory-vae', '§2 VAE (z-posterior)'),
      CML_SEC('theory-gen', '§6 Bayesian regression (ridge = MAP)')
    ]
  },
  'prior': {
    title: 'Prior p(θ)',
    body: 'Belief about a parameter <em>before</em> observing data. A proper probability distribution (integrates to 1). Flat / uniform is a common "know nothing" choice; Beta(1, 1) is the flat prior on a coin\'s bias.',
    related: ['posterior', 'likelihood', 'bayes-rule', 'beta-distribution'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'likelihood': {
    title: 'Likelihood p(𝒟|θ)',
    body: '<em>How probable the observed data is under a given θ</em> — viewed as a function of θ, not of 𝒟. Crucially <strong>not</strong> a probability distribution over θ: it does not integrate to 1 across θ. Maximising it = MLE.',
    related: ['prior', 'posterior', 'bayes-rule', 'mle'],
    sections: [RL_SEC('theory-bandits', '§1 Bandits')]
  },
  'bayes-rule': {
    title: "Bayes' rule",
    body: 'posterior = (likelihood × prior) / evidence. Mechanically: update a prior distribution into a posterior by multiplying pointwise by the likelihood of the observed data and renormalising.',
    related: ['prior', 'likelihood', 'posterior']
  },
  'beta-distribution': {
    title: 'Beta(α, β) distribution',
    body: 'Distribution on [0, 1] with density ∝ p^(α−1) (1−p)^(β−1). The conjugate prior for a Bernoulli/Binomial parameter: Beta prior + h heads + t tails → Beta(α+h, β+t) posterior. Mean α/(α+β); mode (α−1)/(α+β−2) when α, β > 1.',
    related: ['prior', 'posterior', 'thompson', 'alpha-bandit']
  },
  'mle': {
    title: 'MLE · Maximum Likelihood Estimation',
    body: 'Pick θ̂ = argmax<sub>θ</sub> p(𝒟|θ). Equivalent to minimising forward KL from data to model. What most classical supervised learning (logistic/linear regression with Gaussian noise, softmax cross-entropy) is doing under the hood.',
    related: ['likelihood', 'forward-kl', 'map-estimate', 'elbo'],
    sections: [
      CML_SEC('theory-mle', '§2 MLE derivation of squared loss'),
      DF_SEC('theory-vae', '§2 VAE ELBO'),
      RL_SEC('theory-bandits', '§1 Bayesian coin demo')
    ]
  },
  'map-estimate': {
    title: 'MAP · Maximum a Posteriori',
    body: 'θ̂<sub>MAP</sub> = argmax<sub>θ</sub> p(θ|𝒟) = argmax<sub>θ</sub> p(𝒟|θ) p(θ). Adds a prior to MLE; equivalent to MLE with a regularisation term from − log p(θ).',
    related: ['mle', 'prior', 'posterior']
  },
  'credible-interval': {
    title: '95% credible interval',
    body: 'Interval [a, b] such that P(θ ∈ [a, b] | 𝒟) = 0.95 under the posterior. The Bayesian counterpart to a frequentist confidence interval; makes the natural "there\'s a 95 % chance the true value is in here" statement that a CI does <em>not</em>.',
    related: ['posterior', 'beta-distribution']
  },
  'em-algorithm': {
    title: 'EM · Expectation-Maximisation',
    body: 'Iterates two steps: <strong>E-step</strong> computes responsibilities r<sub>i,k</sub> = P(component k | point i) under current params; <strong>M-step</strong> re-estimates μ<sub>k</sub>, σ<sub>k</sub>², π<sub>k</sub> by weighted ML using the responsibilities. Monotonically increases the log-likelihood.',
    related: ['gmm', 'responsibility', 'mle']
  },
  'gmm': {
    title: 'GMM · Gaussian Mixture Model',
    body: 'Soft-clustering generalisation of K-means. Data modelled as Σ<sub>k</sub> π<sub>k</sub> 𝒩(μ<sub>k</sub>, Σ<sub>k</sub>). Each point gets a vector of responsibilities instead of a single cluster label. Fitted by EM.',
    related: ['em-algorithm', 'responsibility', 'mle']
  },
  'responsibility': {
    title: 'Responsibility r<sub>i,k</sub>',
    body: 'Soft-assignment of point i to component k: r<sub>i,k</sub> = P(k | x<sub>i</sub>) = π<sub>k</sub> 𝒩(x<sub>i</sub>; μ<sub>k</sub>, Σ<sub>k</sub>) / Σ<sub>j</sub> π<sub>j</sub> 𝒩(x<sub>i</sub>; μ<sub>j</sub>, Σ<sub>j</sub>). Sums to 1 over k.',
    related: ['gmm', 'em-algorithm']
  },
  'mc-integration': {
    title: 'Monte-Carlo integration',
    body: 'Estimate an expectation 𝔼[f(X)] by averaging N random samples: (1/N) Σ f(x<sub>i</sub>). Error shrinks as O(1/√N) independent of dimension. Every MC return estimate G<sub>t</sub> in RL is the same pattern.',
    related: ['monte-carlo', 'return']
  },

  // ====================== Math Foundations ======================
  'loss': {
    title: 'Loss L(θ)',
    body: 'A scalar function measuring "how wrong" a model with parameters θ is on data. Training = minimising L(θ). Squared error, cross-entropy, KL, policy-gradient objective — all flavours of loss.',
    related: ['gradient', 'argmin', 'learning-rate'],
    sections: [MATH_SEC('theory-gd', '§2 GD')]
  },
  'gradient': {
    title: '∇L · gradient',
    body: 'Vector of partial derivatives. Points in the direction of steepest <em>increase</em> of L. GD steps the opposite direction. Magnitude tells you how steep the slope is.',
    related: ['loss', 'learning-rate', 'argmin', 'policy-gradient', 'score'],
    sections: [
      MATH_SEC('theory-gd', '§2 GD'),
      CML_SEC('demo-logreg', '§3 logistic gradient'),
      RL_SEC('theory-pg', '§7 policy gradient'),
      DF_SEC('theory-score', '§5 score = ∇ log p')
    ]
  },
  'learning-rate': {
    title: 'α · learning rate',
    body: 'Step-size scalar in GD: θ ← θ − α ∇L. Too large: diverges / oscillates. Too small: crawls. Decayed (or scheduled) in most deep-learning setups.',
    related: ['gradient', 'loss', 'momentum'],
    sections: [MATH_SEC('theory-gd', '§2 GD')]
  },
  'convex': {
    title: 'Convex function',
    body: 'f is convex if every line segment between two points on its graph lies above the graph. Single bowl-shaped minimum. GD provably finds the global optimum. Linear/logistic regression, SVM are convex; neural nets are not.',
    related: ['non-convex', 'loss', 'gradient'],
    sections: [MATH_SEC('theory-gd', '§2 GD')]
  },
  'non-convex': {
    title: 'Non-convex function',
    body: 'Multiple minima, saddle points, plateaus. GD can get stuck in a local minimum. Escape tricks: SGD noise, momentum, restarts, simulated annealing.',
    related: ['convex', 'sgd-noise', 'simulated-annealing', 'momentum'],
    sections: [MATH_SEC('theory-nonconvex', '§3 Non-convex')]
  },
  'argmin': {
    title: 'argmin / argmax',
    body: 'argmin<sub>x</sub> f(x) = the input x that achieves the minimum of f (a point, not a number). min<sub>x</sub> f(x) = the minimum value (a number). ML training returns argmin of the loss. Recurs everywhere: MLE = argmax likelihood; MAP = argmax posterior; SVM primal = argmin ½‖w‖² + hinge; K-means = argmin SSE.',
    related: ['loss', 'gradient', 'lagrangian', 'mle', 'map-estimate'],
    sections: [
      MATH_SEC('theory-opt', '§1 Optimisation'),
      CML_SEC('theory-mle', '§2 MLE (argmax likelihood)'),
      CML_SEC('demo-svm', '§4 SVM primal')
    ]
  },
  'lagrangian': {
    title: 'Lagrangian / Lagrange multipliers',
    body: 'Turns a constrained problem "min f(x) s.t. g(x) = 0" into an unconstrained one over the Lagrangian ℒ(x, λ) = f(x) + λ g(x). At the optimum, ∇f = −λ∇g (level sets of f and g are tangent).',
    related: ['argmin', 'convex', 'kkt', 'svm'],
    sections: [
      MATH_SEC('theory-opt', '§1 Optimisation'),
      CML_SEC('demo-svm', '§4 SVM dual'),
      MATH_SEC('theory-pca', '§5 PCA derivation')
    ]
  },
  'momentum': {
    title: 'Momentum',
    body: 'Update v ← β v + ∇L, θ ← θ − α v. Averaged gradient pushes through flat regions and damps oscillations. β ≈ 0.9 is typical. Adam is momentum + per-parameter scale.',
    related: ['gradient', 'learning-rate', 'sgd-noise'],
    sections: [MATH_SEC('theory-nonconvex', '§3 Non-convex')]
  },
  'sgd-noise': {
    title: 'SGD noise',
    body: 'The mini-batch gradient is a noisy estimate of the true gradient. In deep learning that noise is a blessing: it perturbs the iterate off saddles and shallow ridges. Main escape mechanism from non-convex traps.',
    related: ['non-convex', 'momentum', 'simulated-annealing'],
    sections: [MATH_SEC('theory-nonconvex', '§3 Non-convex')]
  },
  'simulated-annealing': {
    title: 'Simulated annealing',
    body: 'Propose random perturbations; always accept improvements, accept worsening moves with probability exp(−ΔL / T). Cool T over time. Finds the global minimum of any function if T is cooled slowly enough. Used for combinatorial problems where gradients do not exist (TSP, graph layout).',
    related: ['non-convex', 'sgd-noise', 'momentum'],
    sections: [MATH_SEC('theory-nonconvex', '§3 Non-convex')]
  },
  'eigenvalue': {
    title: 'Eigenvalue λ, eigenvector v',
    body: 'v is an eigenvector of A if Av = λv — the matrix only <em>scales</em> it, no rotation. λ is the scaling factor. Symmetric matrices have a full orthogonal eigenbasis. PCA is eigendecomposition of the sample covariance.',
    related: ['pca', 'svd', 'linalg'],
    sections: [
      MATH_SEC('theory-linalg', '§4 Linear algebra'),
      MATH_SEC('theory-pca', '§5 PCA — eigendecomposition of Σ'),
      CML_SEC('theory-gen', '§6 Ridge closed form (X⊤X + λI)')
    ]
  },
  'dot-product': {
    title: 'Dot product',
    body: 'a · b = Σ a<sub>i</sub> b<sub>i</sub> = ‖a‖‖b‖ cos θ. Measures how aligned two vectors are. Attention scores, similarity, logistic regression outputs — all dot products.',
    related: ['linalg', 'convolution'],
    sections: [MATH_SEC('theory-linalg', '§4 Linear algebra')]
  },
  'convolution': {
    title: 'Convolution',
    body: '(f * g)(t) = ∫ f(τ) g(t − τ) dτ. A sliding dot product; translation-equivariant. CNN filters are discrete convolutions. Convolution theorem: Fourier turns it into pointwise multiplication.',
    related: ['dot-product', 'linalg'],
    sections: [
      MATH_SEC('theory-linalg', '§4 Linear algebra'),
      FOURIER_SEC('convolution theorem')
    ]
  },
  'linalg': {
    title: 'Linear algebra',
    body: 'Matrices as linear transformations, vector/matrix products, decompositions. The substrate every ML layer runs on. Key facts: columns are images of basis vectors; composition = multiplication; eigendecomposition reveals "natural axes."',
    related: ['eigenvalue', 'svd', 'dot-product', 'convolution'],
    sections: [
      MATH_SEC('theory-linalg', '§4 Linear algebra'),
      FOURIER_SEC('DFT as matrix transform'),
      MATH_SEC('theory-nn', '§6 Wx in neural nets')
    ]
  },
  'svd': {
    title: 'SVD · Singular Value Decomposition',
    body: 'Any matrix X can be written as UΣV<sup>⊤</sup>: rotate (V<sup>⊤</sup>), scale (Σ), rotate (U). Singular values σ<sub>i</sub> = √eigenvalues of X<sup>⊤</sup>X. PCA of centred X = columns of V.',
    related: ['pca', 'eigenvalue', 'linalg']
  },
  'pca': {
    title: 'PCA · Principal Component Analysis',
    body: 'Find the orthogonal directions of maximum variance in a dataset. Eigendecomposition of the sample covariance (or SVD of centred data). Used for dimensionality reduction, denoising, whitening, visualisation — <em>not</em> clustering (that\'s K-means / GMM).',
    related: ['eigenvalue', 'svd', 'variance', 'linalg', 'gmm'],
    sections: [
      MATH_SEC('theory-pca', '§5 PCA'),
      ML_SEC('K-means / GMM (contrast: clustering, not PCA)')
    ]
  },
  'variance': {
    title: 'Variance',
    body: 'Expected squared deviation from the mean: Var[X] = 𝔼[(X − μ)²]. In multi-D, the covariance matrix generalises this — its eigenvalues are variances along the principal axes.',
    related: ['pca', 'eigenvalue']
  },
  'universal-approximation': {
    title: 'Universal approximation theorem',
    body: 'A feedforward neural net with one hidden layer and a non-polynomial activation can approximate any continuous function on a compact domain to arbitrary accuracy — <em>if</em> the hidden layer is wide enough. Doesn\'t say <em>how</em> wide (can be exponential) and doesn\'t say SGD can find the weights.',
    related: ['neural-net', 'activation'],
    sections: [MATH_SEC('theory-nn', '§6 NN')]
  },
  'neural-net': {
    title: 'Neural network',
    body: 'A parameterised function built by stacking layers h = σ(Wx + b). Linear transform (Wx), translation (+b), non-linearity (σ). Enough depth/width gives universal approximation. Used as policy, value, encoder, decoder, score network across every modern ML method.',
    related: ['universal-approximation', 'activation', 'gradient']
  },
  'activation': {
    title: 'Activation function σ',
    body: 'Element-wise non-linearity (ReLU, GELU, sigmoid, tanh, SiLU). Without it, stacked linear layers collapse to a single linear transform — no expressive power beyond regression.',
    related: ['neural-net', 'universal-approximation']
  },
  'kkt': {
    title: 'KKT conditions',
    body: 'Karush-Kuhn-Tucker generalisation of Lagrange multipliers to inequality constraints. Optimality of a constrained optimum requires ∇f + Σ λ<sub>i</sub> ∇g<sub>i</sub> = 0, primal feasibility, dual feasibility (λ ≥ 0), and complementary slackness (λ<sub>i</sub> g<sub>i</sub> = 0).',
    related: ['lagrangian', 'argmin', 'convex']
  },

  // ====================== Classical ML ======================
  'supervised': {
    title: 'Supervised learning',
    body: 'Learn f<sub>θ</sub>(x) ≈ y from a labelled dataset {(x<sub>i</sub>, y<sub>i</sub>)}. Regression when y is a number; classification when y is a category.',
    related: ['regression', 'classification', 'loss', 'mle']
  },
  'regression': {
    title: 'Regression',
    body: 'Predict a continuous y. Linear regression fits y ≈ w<sup>⊤</sup>x + b by minimising squared error.',
    related: ['ols', 'mle', 'regularisation', 'ridge'],
    sections: [CML_SEC('demo-linreg', '§1 Linear regression')]
  },
  'classification': {
    title: 'Classification',
    body: 'Predict a category y. Two-class: logistic regression or SVM. Multiclass: softmax, LDA, trees, k-NN.',
    related: ['logistic-regression', 'svm', 'decision-boundary'],
    sections: [CML_SEC('demo-logreg', '§3 Logistic')]
  },
  'ols': {
    title: 'OLS · Ordinary Least Squares',
    body: 'Pick θ minimising Σ (y<sub>i</sub> − θ<sup>⊤</sup>x<sub>i</sub>)². Closed form θ̂ = (X<sup>⊤</sup>X)<sup>−1</sup>X<sup>⊤</sup>y. Geometrically: orthogonal projection of y onto the column space of X. Falls out of MLE under Gaussian noise.',
    related: ['regression', 'mle', 'ridge'],
    sections: [CML_SEC('demo-linreg', '§1 OLS')]
  },
  'logistic-regression': {
    title: 'Logistic regression',
    body: 'Model P(y=1|x) = σ(w<sup>⊤</sup>x + b). Train by minimising the binary cross-entropy (= −log Bernoulli likelihood). No closed form; minimise by GD/Newton. Decision boundary is linear.',
    related: ['sigmoid', 'cross-entropy', 'mle', 'classification'],
    sections: [CML_SEC('demo-logreg', '§3 Logistic')]
  },
  'sigmoid': {
    title: 'σ · sigmoid / logistic function',
    body: 'σ(z) = 1 / (1 + e<sup>−z</sup>). Maps ℝ → (0, 1) smoothly; makes a linear score interpretable as a probability. Derivative σ(z)(1 − σ(z)).',
    related: ['logistic-regression', 'cross-entropy']
  },
  'cross-entropy': {
    title: 'Cross-entropy loss',
    body: 'For binary y ∈ {0, 1} and predicted p: L = −[y log p + (1 − y) log(1 − p)]. Equivalent to −log Bernoulli likelihood. Generalised by categorical cross-entropy for multi-class softmax outputs. Minimising cross-entropy over data = minimising forward KL to the model = MLE.',
    related: ['logistic-regression', 'mle', 'forward-kl', 'kl'],
    sections: [
      CML_SEC('demo-logreg', '§3 Logistic regression'),
      DF_SEC('theory-kl', '§1 KL — cross-entropy relation')
    ]
  },
  'svm': {
    title: 'SVM · Support Vector Machine',
    body: 'Max-margin classifier. Hard margin: min ½‖w‖² s.t. y<sub>i</sub>(w<sup>⊤</sup>x<sub>i</sub> + b) ≥ 1. Soft margin adds slack ξ<sub>i</sub> with penalty C. Equivalent unconstrained form uses hinge loss. Only support vectors matter at the optimum.',
    related: ['hinge', 'support-vector', 'kernel', 'margin', 'lagrangian'],
    sections: [
      CML_SEC('demo-svm', '§4 SVM'),
      MATH_SEC('theory-opt', '§1 Lagrangian (SVM dual)')
    ]
  },
  'hinge': {
    title: 'Hinge loss',
    body: 'max(0, 1 − y · (w<sup>⊤</sup>x + b)). Zero for points safely outside the margin, linear in the margin violation. Combined with ½‖w‖² it gives the soft-margin SVM primal.',
    related: ['svm', 'support-vector']
  },
  'margin': {
    title: 'Margin',
    body: 'Geometric distance from the separating hyperplane to the nearest training point: 2 / ‖w‖ (with normalised SVM constraints). Wider margin → better generalisation, up to the bias-variance trade-off.',
    related: ['svm', 'support-vector']
  },
  'support-vector': {
    title: 'Support vector',
    body: 'A training point lying on or inside the SVM\'s margin. Only these carry non-zero dual multipliers α<sub>i</sub> and determine (w, b); all other points can be deleted with no change to the classifier.',
    related: ['svm', 'margin', 'lagrangian']
  },
  'kernel': {
    title: 'Kernel K(x, x′)',
    body: 'A function equal to ⟨φ(x), φ(x′)⟩ for some feature map φ, possibly infinite-dimensional. The "kernel trick" lets any dot-product-based algorithm (dual SVM, kernel ridge, GPs) work in that lifted space without computing φ.',
    related: ['svm', 'rbf-kernel']
  },
  'rbf-kernel': {
    title: 'RBF · Gaussian kernel',
    body: 'K(x, x′) = exp(−γ‖x − x′‖²). Implicitly infinite-dimensional. The default general-purpose kernel in SVMs and GPs.',
    related: ['kernel', 'svm']
  },
  'decision-boundary': {
    title: 'Decision boundary',
    body: 'The surface in input space separating regions predicted by a classifier. For a linear model it\'s the hyperplane w<sup>⊤</sup>x + b = 0 (or p = 0.5 for logistic). Kernels / trees / deep nets produce curved boundaries.',
    related: ['svm', 'logistic-regression', 'classification']
  },
  'ridge': {
    title: 'Ridge regression · L2',
    body: 'OLS + λ‖θ‖². Closed form θ̂ = (X<sup>⊤</sup>X + λI)<sup>−1</sup>X<sup>⊤</sup>y. Shrinks coefficients smoothly; MAP under a Gaussian prior on θ.',
    related: ['ols', 'regularisation', 'map-estimate']
  },
  'lasso': {
    title: 'Lasso · L1',
    body: 'OLS + λ‖θ‖<sub>1</sub>. Drives many coefficients to exactly zero — implicit feature selection. MAP under a Laplace prior. No closed form; solved by coordinate descent or LARS.',
    related: ['ridge', 'regularisation', 'map-estimate']
  },
  'regularisation': {
    title: 'Regularisation',
    body: 'Add a penalty on parameter norm to the training loss so the model can\'t over-fit: min L(θ) + λ Ω(θ). Classic choices: L2 (ridge), L1 (lasso), elastic net. Deep-learning extensions: dropout, weight decay, early stopping, data augmentation. MAP = MLE + regulariser from −log prior.',
    related: ['ridge', 'lasso', 'bias-variance', 'map-estimate', 'entropy-bonus'],
    sections: [
      CML_SEC('theory-gen', '§6 Generalisation'),
      RL_SEC('theory-pg', '§7 entropy bonus (policy regulariser)')
    ]
  },
  'bias-variance': {
    title: 'Bias / variance trade-off',
    body: 'Expected test error = bias² + variance + irreducible noise. Bias shrinks with model capacity; variance grows with it. Regularisation and cross-validation pick a sweet spot.',
    related: ['regularisation', 'ridge']
  }
};
