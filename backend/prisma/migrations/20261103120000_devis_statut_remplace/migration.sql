-- AlterEnum: ancien devis accepté → remplacé quand une nouvelle version est acceptée
ALTER TYPE "DevisStatut" ADD VALUE 'remplace';
