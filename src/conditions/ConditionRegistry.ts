import type { ConditionExpression, FormValues } from '../types';

export type CustomConditionOperatorFn = (
  actualValue: unknown,
  expectedOperand: unknown,
  context: { values: FormValues; fieldPath: string }
) => boolean;

/**
 * Registry of reusable named conditions and custom comparison operators.
 */
export class ConditionRegistry {
  private namedConditions = new Map<string, ConditionExpression>();
  private customOperators = new Map<string, CustomConditionOperatorFn>();

  public registerCondition(name: string, expression: ConditionExpression): () => void {
    const key = name.trim();
    this.namedConditions.set(key, expression);
    return () => {
      this.namedConditions.delete(key);
    };
  }

  public getCondition(name: string): ConditionExpression | undefined {
    return this.namedConditions.get(name.trim());
  }

  public hasCondition(name: string): boolean {
    return this.namedConditions.has(name.trim());
  }

  public registerOperator(
    operatorName: string,
    evaluator: CustomConditionOperatorFn
  ): () => void {
    const key = operatorName.trim();
    this.customOperators.set(key, evaluator);
    return () => {
      this.customOperators.delete(key);
    };
  }

  public getOperator(operatorName: string): CustomConditionOperatorFn | undefined {
    return this.customOperators.get(operatorName.trim());
  }

  public hasOperator(operatorName: string): boolean {
    return this.customOperators.has(operatorName.trim());
  }

  public listConditionNames(): string[] {
    return Array.from(this.namedConditions.keys()).sort();
  }

  public listOperatorNames(): string[] {
    return Array.from(this.customOperators.keys()).sort();
  }

  public clear(): void {
    this.namedConditions.clear();
    this.customOperators.clear();
  }
}

export const defaultConditionRegistry = new ConditionRegistry();
