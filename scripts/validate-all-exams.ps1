param(
    [switch]$SkipPredictionValidation
)

$ErrorActionPreference = "Stop"
$validationErrors = [System.Collections.Generic.List[string]]::new()
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$examDirectory = Join-Path $repositoryRoot "exam\json"
$allowedChapters = @("1.1", "1.2", "1.3", "2.1", "2.2", "3.1", "3.2", "4.1", "4.2")
$singleType = '"\u55ae\u9078\u984c"' | ConvertFrom-Json
$multiType = '"\u8907\u9078\u984c"' | ConvertFrom-Json
$caseType = '"\u984c\u7d44"' | ConvertFrom-Json
$caseMultiType = '"\u984c\u7d44\uff08\u8907\u9078\uff09"' | ConvertFrom-Json
$predictionMarker = '"\u9810\u6e2c"' | ConvertFrom-Json
$selfAssessmentMarker = '"\u81ea\u6211\u8a55\u91cf"' | ConvertFrom-Json
$placeholderPattern = "(?i)^\s*(?:TODO|TBD|FIXME|PLACEHOLDER|\u5f85\u88dc|\u5f85\u586b)(?:\s*[:：-]|\s*$)"
$allowedTypes = @($singleType, $multiType, $caseType, $caseMultiType)

function Add-ValidationError([string]$Message) {
    $script:validationErrors.Add($Message)
}

function Has-Property($Object, [string]$Name) {
    return $null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name
}

function Get-Text($Value) {
    if ($null -eq $Value) {
        return ""
    }
    return ([string]$Value).Trim()
}

$files = @(Get-ChildItem -LiteralPath $examDirectory -Filter "*.json" -File | Sort-Object Name)
$totalQuestions = 0
$predictionFiles = 0
$historicalFiles = 0
$selfAssessmentFiles = 0

foreach ($file in $files) {
    try {
        $document = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Add-ValidationError "$($file.Name): invalid JSON: $($_.Exception.Message)"
        continue
    }

    if (-not (Has-Property $document "questions")) {
        Add-ValidationError "$($file.Name): missing questions array"
        continue
    }

    $questions = @($document.questions)
    $totalQuestions += $questions.Count
    $isSelfAssessment = $file.Name.Contains($selfAssessmentMarker)
    if ($file.Name.Contains($predictionMarker)) {
        $predictionFiles++
        if ($questions.Count -ne 40) {
            Add-ValidationError "$($file.Name): predicted exam must contain 40 questions; found $($questions.Count)"
        }
    } elseif ($isSelfAssessment) {
        $selfAssessmentFiles++
    } else {
        $historicalFiles++
        if ($questions.Count -ne 40) {
            Add-ValidationError "$($file.Name): historical exam must contain 40 questions; found $($questions.Count)"
        }
    }

    for ($index = 0; $index -lt $questions.Count; $index++) {
        $question = $questions[$index]
        $id = if (Has-Property $question "id") { Get-Text $question.id } else { "index-$($index + 1)" }
        $reference = "$($file.Name)#$id"

        foreach ($field in @(
            "id",
            "type",
            "answer",
            "question_text",
            "options",
            "explanation",
            "chapter",
            "competency"
        )) {
            if (-not (Has-Property $question $field)) {
                Add-ValidationError "$reference`: missing field '$field'"
            }
        }

        if (-not (Has-Property $question "id") -or $question.id -isnot [int]) {
            Add-ValidationError "$reference`: id must be an integer"
        } elseif (-not $isSelfAssessment -and $question.id -ne ($index + 1)) {
            Add-ValidationError "$reference`: id must be integer $($index + 1)"
        }

        foreach ($field in @("type", "answer", "question_text", "explanation", "chapter", "competency")) {
            if ((Has-Property $question $field) -and [string]::IsNullOrWhiteSpace((Get-Text $question.$field))) {
                Add-ValidationError "$reference`: field '$field' is empty"
            }
        }

        if ((Has-Property $question "explanation") -and (Get-Text $question.explanation).Length -lt 30) {
            Add-ValidationError "$reference`: explanation must contain at least 30 characters"
        }

        $optionKeys = @()
        if (-not (Has-Property $question "options") -or $question.options -isnot [pscustomobject]) {
            Add-ValidationError "$reference`: options must be an object"
        } else {
            $optionKeys = @($question.options.PSObject.Properties.Name)
            if (($optionKeys -join "") -cne "ABCD") {
                Add-ValidationError "$reference`: option keys must be exactly A, B, C, D in order"
            }
            $uniqueOptions = @{}
            foreach ($letter in @("A", "B", "C", "D")) {
                $optionText = if (Has-Property $question.options $letter) {
                    Get-Text $question.options.$letter
                } else {
                    ""
                }
                if ([string]::IsNullOrWhiteSpace($optionText)) {
                    Add-ValidationError "$reference`: option $letter is missing or empty"
                } elseif ($uniqueOptions.ContainsKey($optionText)) {
                    Add-ValidationError "$reference`: option $letter duplicates option $($uniqueOptions[$optionText])"
                } else {
                    $uniqueOptions[$optionText] = $letter
                }
            }
        }

        $answer = Get-Text $question.answer
        if ($answer -cnotmatch "^[A-D]+$") {
            Add-ValidationError "$reference`: answer '$answer' must contain only uppercase A-D"
        } else {
            $letters = @($answer.ToCharArray() | ForEach-Object { [string]$_ })
            if (@($letters | Sort-Object -Unique).Count -ne $letters.Count) {
                Add-ValidationError "$reference`: answer '$answer' contains duplicate letters"
            }
            if ($answer -cne (@($letters | Sort-Object) -join "")) {
                Add-ValidationError "$reference`: answer '$answer' must be in ascending order"
            }
            foreach ($letter in $letters) {
                if ($letter -notin $optionKeys) {
                    Add-ValidationError "$reference`: answer refers to missing option $letter"
                }
            }
        }

        $type = Get-Text $question.type
        if ($type -notin $allowedTypes) {
            Add-ValidationError "$reference`: unsupported type '$type'"
        }
        $isMultiAnswer = $answer.Length -gt 1
        $typeIsMulti = $type -eq $multiType -or $type -eq $caseMultiType
        if ($isMultiAnswer -ne $typeIsMulti) {
            Add-ValidationError "$reference`: type '$type' conflicts with answer '$answer'"
        }

        $isCaseType = $type -eq $caseType -or $type -eq $caseMultiType
        $hasCaseGroup = Has-Property $question "case_group" -and $null -ne $question.case_group
        if ($isCaseType -and -not $hasCaseGroup) {
            Add-ValidationError "$reference`: case question must define case_group"
        } elseif (-not $isCaseType -and $hasCaseGroup) {
            Add-ValidationError "$reference`: non-case question must not define case_group"
        }

        $chapter = Get-Text $question.chapter
        if ($chapter -notin $allowedChapters) {
            Add-ValidationError "$reference`: invalid chapter '$chapter'"
        }

        foreach ($field in @("question_text", "explanation", "competency")) {
            $content = Get-Text $question.$field
            if ($content -match $placeholderPattern) {
                Add-ValidationError "$reference`: field '$field' contains a placeholder"
            }
            if ($content.Contains([string][char]0xFFFD)) {
                Add-ValidationError "$reference`: field '$field' contains U+FFFD"
            }
        }
    }

    if ($isSelfAssessment) {
        $unitGroups = @($questions | Group-Object unit)
        if ($unitGroups.Count -ne 9) {
            Add-ValidationError "$($file.Name): expected 9 assessment units; found $($unitGroups.Count)"
        }
        foreach ($unitGroup in $unitGroups) {
            $unitIds = @($unitGroup.Group.id | Sort-Object)
            if (($unitIds -join ",") -ne "1,2,3,4,5,6,7,8,9,10") {
                Add-ValidationError "$($file.Name): unit '$($unitGroup.Name)' must use ids 1..10"
            }
        }
    }
}

if (-not $SkipPredictionValidation) {
    $predictionValidator = Join-Path $PSScriptRoot "validate-predicted-exams.ps1"
    $predictionOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $predictionValidator -ShowNearDuplicates
    if ($LASTEXITCODE -ne 0) {
        foreach ($line in $predictionOutput) {
            Add-ValidationError "prediction validator: $line"
        }
    } else {
        $predictionOutput | Write-Output
    }
}

if ($validationErrors.Count -gt 0) {
    foreach ($validationError in $validationErrors) {
        Write-Output "[ERROR] $validationError"
    }
    Write-Output "Validation failed: $($validationErrors.Count) error(s)."
    exit 1
}

Write-Output (
    "All-exam validation passed: {0} files, {1} questions ({2} predicted, {3} historical, {4} self-assessment file)." -f
    $files.Count,
    $totalQuestions,
    $predictionFiles,
    $historicalFiles,
    $selfAssessmentFiles
)
